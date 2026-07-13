# ComfyUI mAI Frame Canvas

A ComfyUI custom node for recutting a frame sequence onto a safe processing canvas for outpainting, image/video generation, and model-specific size constraints.

## Node

### mAI Frame Canvas Recut

Input:
- `frames`: ComfyUI `IMAGE` batch, usually loaded from a video or frame sequence

Main controls:
- `canvas_width`, `canvas_height`: requested content canvas size
- `processing_multiple`: forces the final processing canvas to a multiple, for example `32` for LTX 2.3
- `min_width`, `min_height`: minimum processing canvas size
- `max_width`, `max_height`: maximum processing canvas size
- `padding_strategy`: controls where extra pixels are added when the processing canvas needs padding
  - `centered`: distributes padding around the content canvas
  - `keep_anchor`: keeps padding aligned with the selected anchor
  - `pad_right_bottom`: keeps content at the top-left and adds padding right/bottom
  - `pad_left_top`: adds padding left/top
- `target_width`, `target_height`: resized source frame size. There is no `resize_mode`; the node always uses target-size logic.
- `anchor`: starting position logic inside the content canvas
- `x_offset`, `y_offset`: reposition the frame sequence inside the content canvas
- `background_r/g/b`: background color visible where the frame does not cover the canvas
- `resize_algorithm`: resize method

Frontend preview:
- Blue outline: requested content canvas inside the larger processing canvas
- White outline: frame/image bounding box
- Drag the image to move it
- Drag handles to resize it
- Mouse wheel zooms the image by updating `target_width` and `target_height`
- Hold Shift while dragging handles for free resize

Outputs:
- `recut_frames`: full recut frame batch on the processing canvas
- `preview_first_frame`: first frame only, useful for connecting to a normal ComfyUI Preview Image node
- `extended_area_mask`: mask frame sequence, repeated to match the input batch
- `actual_canvas_width`, `actual_canvas_height`: final processing canvas size
- `content_x`, `content_y`, `content_width`, `content_height`: position and size of the requested content canvas inside the processing canvas. Use this metadata later to crop away padding.

## Install

Copy this folder into:

```txt
ComfyUI/custom_nodes/ComfyUI-mAI-FrameCanvas
```

Then restart ComfyUI and refresh the browser.

## Suggested workflow

```txt
Load Video / Load Image Batch
        ↓
mAI Frame Canvas Recut
        ↓
Outpaint / Video Model / Processing
        ↓
Crop using content_x, content_y, content_width, content_height
        ↓
Optional final resize to exact delivery size
```

## JS structure

The frontend is split into modules under `js/frame_canvas_recut/`:

- `constants.js`
- `utils.js`
- `geometry.js`
- `drawing.js`
- `interactions.js`
- `pointer_capture.js`
- `extension.js`

The entry file is `js/frame_canvas_recut.js`.

## Restore workflow outputs

The node now exposes both the requested final canvas and the safe processing canvas.

- `final_canvas_width`, `final_canvas_height`: the exact user-defined canvas size, for example `728 × 90`.
- `processing_canvas_width`, `processing_canvas_height`: the full safe canvas sent to the model, after `processing_multiple`, min size, and max size rules. For example `736 × 256`.
- `crop_x`, `crop_y`, `crop_width`, `crop_height`: the crop box inside the processing canvas. Use this after generation to remove the padding and return to the original composition area.

Typical post-process flow:

```txt
model output
  ↓
resize full generated frame to processing_canvas_width × processing_canvas_height
  ↓
crop using crop_x, crop_y, crop_width, crop_height
  ↓
resize if needed to final_canvas_width × final_canvas_height
```
