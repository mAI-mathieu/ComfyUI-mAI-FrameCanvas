import math
import os
import uuid
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

try:
    import folder_paths
except Exception:
    folder_paths = None


RESAMPLING = getattr(Image, "Resampling", Image)


class MAIFrameCanvasRecut:
    """
    Recut a frame sequence onto a fixed canvas.

    Input:
        frames: ComfyUI IMAGE batch [B, H, W, C], float 0..1

    Outputs:
        recut_frames: full image batch on final canvas
        preview_first_frame: first frame only for Preview Image
        extended_area_mask: MASK batch [B, H, W], white where the canvas is extended / uncovered
        final_canvas_width/final_canvas_height: exact requested canvas size
        processing_canvas_width/processing_canvas_height: safe model canvas size
        crop_x/crop_y/crop_width/crop_height: crop box to remove processing padding
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "frames": ("IMAGE",),

                "canvas_width": ("INT", {
                    "default": 1280,
                    "min": 1,
                    "max": 16384,
                    "step": 1,
                }),
                "canvas_height": ("INT", {
                    "default": 720,
                    "min": 1,
                    "max": 16384,
                    "step": 1,
                }),

                "processing_multiple": ("INT", {
                    "default": 32,
                    "min": 1,
                    "max": 2048,
                    "step": 1,
                }),
                "min_width": ("INT", {
                    "default": 512,
                    "min": 1,
                    "max": 16384,
                    "step": 1,
                }),
                "min_height": ("INT", {
                    "default": 512,
                    "min": 1,
                    "max": 16384,
                    "step": 1,
                }),
                "max_width": ("INT", {
                    "default": 2048,
                    "min": 1,
                    "max": 16384,
                    "step": 1,
                }),
                "max_height": ("INT", {
                    "default": 2048,
                    "min": 1,
                    "max": 16384,
                    "step": 1,
                }),
                "padding_strategy": ([
                    "centered",
                    "keep_anchor",
                    "pad_right_bottom",
                    "pad_left_top",
                ], {"default": "centered"}),

                "target_width": ("INT", {
                    "default": 1280,
                    "min": 1,
                    "max": 16384,
                    "step": 1,
                }),
                "target_height": ("INT", {
                    "default": 720,
                    "min": 1,
                    "max": 16384,
                    "step": 1,
                }),

                "anchor": ([
                    "top_left",
                    "center",
                    "top_center",
                    "bottom_center",
                    "left_center",
                    "right_center",
                ], {"default": "top_left"}),

                "x_offset": ("INT", {
                    "default": 0,
                    "min": -16384,
                    "max": 16384,
                    "step": 1,
                }),
                "y_offset": ("INT", {
                    "default": 0,
                    "min": -16384,
                    "max": 16384,
                    "step": 1,
                }),

                "background_r": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 255,
                    "step": 1,
                }),
                "background_g": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 255,
                    "step": 1,
                }),
                "background_b": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 255,
                    "step": 1,
                }),

                "resize_algorithm": ([
                    "nearest",
                    "bilinear",
                    "bicubic",
                    "area",
                    "box",
                    "hamming",
                    "lanczos",
                ], {"default": "bicubic"}),

                "mask_expand": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 512,
                    "step": 1,
                }),
                "mask_feather": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 512,
                    "step": 1,
                }),
            }
        }

    RETURN_TYPES = (
        "IMAGE",
        "IMAGE",
        "MASK",
        "INT",
        "INT",
        "INT",
        "INT",
        "INT",
        "INT",
        "INT",
        "INT",
    )
    RETURN_NAMES = (
        "recut_frames",
        "preview_first_frame",
        "extended_area_mask",
        "final_canvas_width",
        "final_canvas_height",
        "processing_canvas_width",
        "processing_canvas_height",
        "crop_x",
        "crop_y",
        "crop_width",
        "crop_height",
    )

    FUNCTION = "recut"
    CATEGORY = "mAI/video"
    OUTPUT_NODE = True

    def _ceil_dimension(self, value):
        return max(1, int(math.ceil(float(value))))

    def _ceil_to_multiple(self, value, multiple):
        value = self._ceil_dimension(value)
        multiple = max(1, int(multiple))
        return ((value + multiple - 1) // multiple) * multiple

    def _floor_to_multiple(self, value, multiple):
        value = max(1, int(round(value)))
        multiple = max(1, int(multiple))
        return max(multiple, (value // multiple) * multiple)

    def _get_processing_layout(
        self,
        canvas_w,
        canvas_h,
        target_w,
        target_h,
        x_offset,
        y_offset,
        anchor,
        processing_multiple,
        min_width,
        min_height,
        max_width,
        max_height,
        padding_strategy,
    ):
        canvas_w = self._ceil_dimension(canvas_w)
        canvas_h = self._ceil_dimension(canvas_h)
        target_w = self._ceil_dimension(target_w)
        target_h = self._ceil_dimension(target_h)
        processing_multiple = self._ceil_dimension(processing_multiple)
        min_width = self._ceil_dimension(min_width)
        min_height = self._ceil_dimension(min_height)
        max_width = self._ceil_dimension(max_width)
        max_height = self._ceil_dimension(max_height)

        max_aligned_w = self._floor_to_multiple(max_width, processing_multiple)
        max_aligned_h = self._floor_to_multiple(max_height, processing_multiple)

        scale = min(
            1.0,
            max_aligned_w / max(1, canvas_w),
            max_aligned_h / max(1, canvas_h),
        )

        safe_canvas_w = self._ceil_dimension(canvas_w * scale)
        safe_canvas_h = self._ceil_dimension(canvas_h * scale)
        safe_target_w = self._ceil_dimension(target_w * scale)
        safe_target_h = self._ceil_dimension(target_h * scale)
        safe_x_offset = int(round(x_offset * scale))
        safe_y_offset = int(round(y_offset * scale))

        processing_w = self._ceil_to_multiple(max(safe_canvas_w, min_width), processing_multiple)
        processing_h = self._ceil_to_multiple(max(safe_canvas_h, min_height), processing_multiple)
        processing_w = min(processing_w, max_aligned_w)
        processing_h = min(processing_h, max_aligned_h)

        # If min/max are contradictory, keep the aligned max and scale the composition down again.
        if safe_canvas_w > processing_w or safe_canvas_h > processing_h:
            scale2 = min(processing_w / safe_canvas_w, processing_h / safe_canvas_h)
            safe_canvas_w = self._ceil_dimension(safe_canvas_w * scale2)
            safe_canvas_h = self._ceil_dimension(safe_canvas_h * scale2)
            safe_target_w = self._ceil_dimension(safe_target_w * scale2)
            safe_target_h = self._ceil_dimension(safe_target_h * scale2)
            safe_x_offset = int(round(safe_x_offset * scale2))
            safe_y_offset = int(round(safe_y_offset * scale2))
            scale *= scale2

        extra_w = max(0, processing_w - safe_canvas_w)
        extra_h = max(0, processing_h - safe_canvas_h)

        if padding_strategy == "pad_right_bottom":
            pad_x = 0
            pad_y = 0
        elif padding_strategy == "pad_left_top":
            pad_x = extra_w
            pad_y = extra_h
        elif padding_strategy == "keep_anchor":
            if anchor in {"center", "top_center", "bottom_center"}:
                pad_x = extra_w // 2
            elif anchor == "right_center":
                pad_x = extra_w
            else:
                pad_x = 0

            if anchor in {"center", "left_center", "right_center"}:
                pad_y = extra_h // 2
            elif anchor == "bottom_center":
                pad_y = extra_h
            else:
                pad_y = 0
        else:
            pad_x = extra_w // 2
            pad_y = extra_h // 2

        return {
            "processing_w": int(processing_w),
            "processing_h": int(processing_h),
            "content_x": int(pad_x),
            "content_y": int(pad_y),
            "content_w": int(safe_canvas_w),
            "content_h": int(safe_canvas_h),
            "target_w": int(safe_target_w),
            "target_h": int(safe_target_h),
            "x_offset": int(safe_x_offset),
            "y_offset": int(safe_y_offset),
            "scale": float(scale),
        }

    def _get_resized_size(self, target_w, target_h):
        return self._ceil_dimension(target_w), self._ceil_dimension(target_h)

    def _anchor_position(
        self,
        anchor,
        canvas_w,
        canvas_h,
        frame_w,
        frame_h,
        x_offset,
        y_offset,
    ):
        if anchor == "center":
            x = (canvas_w - frame_w) // 2
            y = (canvas_h - frame_h) // 2

        elif anchor == "top_center":
            x = (canvas_w - frame_w) // 2
            y = 0

        elif anchor == "bottom_center":
            x = (canvas_w - frame_w) // 2
            y = canvas_h - frame_h

        elif anchor == "left_center":
            x = 0
            y = (canvas_h - frame_h) // 2

        elif anchor == "right_center":
            x = canvas_w - frame_w
            y = (canvas_h - frame_h) // 2

        else:
            x = 0
            y = 0

        return int(x + x_offset), int(y + y_offset)

    def _resize_frames_torch(self, frames, new_h, new_w, resize_algorithm):
        frames_nchw = frames.movedim(-1, 1)

        if resize_algorithm == "nearest":
            resized = F.interpolate(
                frames_nchw,
                size=(new_h, new_w),
                mode="nearest",
            )

        elif resize_algorithm == "bilinear":
            resized = F.interpolate(
                frames_nchw,
                size=(new_h, new_w),
                mode="bilinear",
                align_corners=False,
            )

        elif resize_algorithm == "bicubic":
            resized = F.interpolate(
                frames_nchw,
                size=(new_h, new_w),
                mode="bicubic",
                align_corners=False,
            )

        elif resize_algorithm == "area":
            resized = F.interpolate(
                frames_nchw,
                size=(new_h, new_w),
                mode="area",
            )

        else:
            resized = F.interpolate(
                frames_nchw,
                size=(new_h, new_w),
                mode="bilinear",
                align_corners=False,
            )

        return resized.movedim(1, -1).clamp(0.0, 1.0)

    def _resize_frames_pil(self, frames, new_h, new_w, resize_algorithm):
        resample_map = {
            "nearest": RESAMPLING.NEAREST,
            "box": RESAMPLING.BOX,
            "bilinear": RESAMPLING.BILINEAR,
            "hamming": RESAMPLING.HAMMING,
            "bicubic": RESAMPLING.BICUBIC,
            "lanczos": RESAMPLING.LANCZOS,
        }

        resample = resample_map.get(resize_algorithm, RESAMPLING.BICUBIC)

        batch, _, _, channels = frames.shape
        src_dtype = frames.dtype
        src_device = frames.device

        frames_cpu = frames.detach().clamp(0.0, 1.0).cpu()
        output_frames = []

        for i in range(batch):
            frame_np = (
                frames_cpu[i].numpy() * 255.0
            ).round().clip(0, 255).astype(np.uint8)

            if channels == 1:
                pil_img = Image.fromarray(frame_np[..., 0], mode="L")
                resized_np = np.array(
                    pil_img.resize((new_w, new_h), resample=resample),
                    dtype=np.uint8,
                )[..., None]

            elif channels == 3:
                pil_img = Image.fromarray(frame_np, mode="RGB")
                resized_np = np.array(
                    pil_img.resize((new_w, new_h), resample=resample),
                    dtype=np.uint8,
                )

            elif channels == 4:
                pil_img = Image.fromarray(frame_np, mode="RGBA")
                resized_np = np.array(
                    pil_img.resize((new_w, new_h), resample=resample),
                    dtype=np.uint8,
                )

            else:
                single = frames[i:i + 1]
                resized_single = self._resize_frames_torch(
                    single,
                    new_h,
                    new_w,
                    "bicubic",
                )
                output_frames.append(resized_single.squeeze(0))
                continue

            output_frames.append(
                torch.from_numpy(resized_np).to(dtype=src_dtype) / 255.0
            )

        return torch.stack(output_frames, dim=0).to(
            device=src_device,
            dtype=src_dtype,
        ).clamp(0.0, 1.0)

    def _resize_frames(self, frames, new_h, new_w, resize_algorithm):
        if frames.shape[1] == new_h and frames.shape[2] == new_w:
            return frames

        if resize_algorithm in {"box", "hamming", "lanczos"}:
            return self._resize_frames_pil(
                frames,
                new_h,
                new_w,
                resize_algorithm,
            )

        return self._resize_frames_torch(
            frames,
            new_h,
            new_w,
            resize_algorithm,
        )

    def _make_background(
        self,
        batch,
        canvas_h,
        canvas_w,
        channels,
        dtype,
        device,
        background_r,
        background_g,
        background_b,
    ):
        bg_rgb = torch.tensor(
            [
                background_r / 255.0,
                background_g / 255.0,
                background_b / 255.0,
            ],
            dtype=dtype,
            device=device,
        )

        if channels == 1:
            bg = bg_rgb.mean().view(1, 1, 1, 1)

        elif channels == 2:
            bg = torch.tensor(
                [bg_rgb.mean().item(), 1.0],
                dtype=dtype,
                device=device,
            ).view(1, 1, 1, 2)

        else:
            bg = torch.zeros((channels,), dtype=dtype, device=device)
            bg[:3] = bg_rgb

            if channels > 3:
                bg[3:] = 1.0

            bg = bg.view(1, 1, 1, channels)

        return bg.expand(batch, canvas_h, canvas_w, channels).clone()

    def _process_mask(self, mask, mask_expand, mask_feather):
        """
        Input mask shape: [1, H, W]
        Output mask shape: [1, H, W]
        """
        mask = mask.clamp(0.0, 1.0)

        if mask_expand > 0:
            k = int(mask_expand) * 2 + 1
            mask = F.max_pool2d(
                mask.unsqueeze(1),
                kernel_size=k,
                stride=1,
                padding=int(mask_expand),
            ).squeeze(1)

        if mask_feather > 0:
            k = int(mask_feather) * 2 + 1
            mask = F.avg_pool2d(
                mask.unsqueeze(1),
                kernel_size=k,
                stride=1,
                padding=int(mask_feather),
                count_include_pad=False,
            ).squeeze(1)

        return mask.clamp(0.0, 1.0)

    def _tensor_to_pil(self, image):
        image = image.detach().clamp(0.0, 1.0).cpu()

        if image.ndim != 3:
            raise ValueError("Expected single image tensor [H,W,C]")

        h, w, c = image.shape
        arr = (image.numpy() * 255.0).round().clip(0, 255).astype(np.uint8)

        if c == 1:
            return Image.fromarray(arr[..., 0], mode="L").convert("RGB")

        if c == 4:
            return Image.fromarray(arr, mode="RGBA")

        return Image.fromarray(arr[..., :3], mode="RGB")

    def _save_temp_preview(self, image, label):
        if folder_paths is None:
            return None

        temp_dir = folder_paths.get_temp_directory()
        filename = f"mAI_frame_canvas_{label}_{uuid.uuid4().hex}.png"
        path = os.path.join(temp_dir, filename)

        pil_img = self._tensor_to_pil(image)
        pil_img.save(path, compress_level=1)

        return {
            "filename": filename,
            "subfolder": "",
            "type": "temp",
        }

    def recut(
        self,
        frames,
        canvas_width,
        canvas_height,
        processing_multiple,
        min_width,
        min_height,
        max_width,
        max_height,
        padding_strategy,
        target_width,
        target_height,
        anchor,
        x_offset,
        y_offset,
        background_r,
        background_g,
        background_b,
        resize_algorithm,
        mask_expand,
        mask_feather,
    ):
        if frames.ndim != 4:
            raise ValueError(
                f"Expected IMAGE tensor shape [B,H,W,C], got {tuple(frames.shape)}"
            )

        batch, src_h, src_w, channels = frames.shape

        layout = self._get_processing_layout(
            canvas_w=canvas_width,
            canvas_h=canvas_height,
            target_w=target_width,
            target_h=target_height,
            x_offset=int(x_offset),
            y_offset=int(y_offset),
            anchor=anchor,
            processing_multiple=processing_multiple,
            min_width=min_width,
            min_height=min_height,
            max_width=max_width,
            max_height=max_height,
            padding_strategy=padding_strategy,
        )

        canvas_w = layout["processing_w"]
        canvas_h = layout["processing_h"]
        content_x = layout["content_x"]
        content_y = layout["content_y"]
        content_w = layout["content_w"]
        content_h = layout["content_h"]

        new_w, new_h = self._get_resized_size(
            layout["target_w"],
            layout["target_h"],
        )

        resized = self._resize_frames(
            frames,
            new_h,
            new_w,
            resize_algorithm,
        )

        canvas = self._make_background(
            batch=batch,
            canvas_h=canvas_h,
            canvas_w=canvas_w,
            channels=channels,
            dtype=frames.dtype,
            device=frames.device,
            background_r=background_r,
            background_g=background_g,
            background_b=background_b,
        )

        # One single mask only.
        # Shape here is [1, H, W].
        # It becomes [H, W] before output.
        mask = torch.ones(
            (1, canvas_h, canvas_w),
            dtype=frames.dtype,
            device=frames.device,
        )

        paste_x, paste_y = self._anchor_position(
            anchor,
            content_w,
            content_h,
            new_w,
            new_h,
            layout["x_offset"],
            layout["y_offset"],
        )
        paste_x += content_x
        paste_y += content_y

        canvas_x0 = max(paste_x, 0)
        canvas_y0 = max(paste_y, 0)
        canvas_x1 = min(paste_x + new_w, canvas_w)
        canvas_y1 = min(paste_y + new_h, canvas_h)

        if canvas_x1 > canvas_x0 and canvas_y1 > canvas_y0:
            src_x0 = max(-paste_x, 0)
            src_y0 = max(-paste_y, 0)
            src_x1 = src_x0 + (canvas_x1 - canvas_x0)
            src_y1 = src_y0 + (canvas_y1 - canvas_y0)

            canvas[
                :,
                canvas_y0:canvas_y1,
                canvas_x0:canvas_x1,
                :
            ] = resized[
                :,
                src_y0:src_y1,
                src_x0:src_x1,
                :
            ]

            # Black where the original frame sequence is visible.
            mask[
                :,
                canvas_y0:canvas_y1,
                canvas_x0:canvas_x1,
            ] = 0.0

        # Output a mask frame sequence [B, H, W].
        # The mask is identical for every frame, but repeated to match the frame batch.
        mask = self._process_mask(
            mask,
            int(mask_expand),
            int(mask_feather),
        )

        mask = mask.expand(batch, -1, -1).clone()

        preview = canvas[:1].clone()

        # Send only the source frame to the JS frontend.
        # Do not send the recut frame, otherwise ComfyUI shows extra image previews.
        ui_images = []

        source_preview = self._save_temp_preview(frames[0], "source")
        if source_preview is not None:
            ui_images.append(source_preview)

        return {
            "ui": {
                "images": ui_images,
            },
            "result": (
                canvas,
                preview,
                mask,
                self._ceil_dimension(canvas_width),
                self._ceil_dimension(canvas_height),
                int(canvas_w),
                int(canvas_h),
                int(content_x),
                int(content_y),
                int(content_w),
                int(content_h),
            ),
        }


NODE_CLASS_MAPPINGS = {
    "MAIFrameCanvasRecut": MAIFrameCanvasRecut,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MAIFrameCanvasRecut": "mAI Frame Canvas Recut",
}
