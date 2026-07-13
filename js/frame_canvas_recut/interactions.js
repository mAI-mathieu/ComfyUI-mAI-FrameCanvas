import { MIN_FRAME_SIZE } from "./constants.js";
import { clamp, getPoint, getValue, setValue } from "./utils.js";
import { findHandle, getAnchorBase, getCanvasInfo, pointInsideRect, previewPointToCanvas, rectsIntersect } from "./geometry.js";

function applyTargetTransform(node, info, newPasteX, newPasteY, newW, newH) {
    newW = Math.max(MIN_FRAME_SIZE, Math.round(newW));
    newH = Math.max(MIN_FRAME_SIZE, Math.round(newH));

    const safeScale = info.scaleFactor || 1;
    const localPasteX = newPasteX - (info.contentX || 0);
    const localPasteY = newPasteY - (info.contentY || 0);
    const base = getAnchorBase(node, info.contentW, info.contentH, newW, newH);

    setValue(node, "target_width", Math.max(MIN_FRAME_SIZE, Math.round(newW / safeScale)));
    setValue(node, "target_height", Math.max(MIN_FRAME_SIZE, Math.round(newH / safeScale)));
    setValue(node, "x_offset", Math.round((localPasteX - base.x) / safeScale));
    setValue(node, "y_offset", Math.round((localPasteY - base.y) / safeScale));
}

function resizeFromHandle(start, mouseCanvas, handleName, keepAspect) {
    let left = start.pasteX;
    let top = start.pasteY;
    let right = start.pasteX + start.frameW;
    let bottom = start.pasteY + start.frameH;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const hasN = handleName.includes("n");
    const hasS = handleName.includes("s");
    const hasW = handleName.includes("w");
    const hasE = handleName.includes("e");

    if (!keepAspect) {
        if (hasW) left = mouseCanvas.x;
        if (hasE) right = mouseCanvas.x;
        if (hasN) top = mouseCanvas.y;
        if (hasS) bottom = mouseCanvas.y;
        return {
            x: Math.min(left, right),
            y: Math.min(top, bottom),
            w: Math.max(MIN_FRAME_SIZE, Math.abs(right - left)),
            h: Math.max(MIN_FRAME_SIZE, Math.abs(bottom - top)),
        };
    }

    const aspect = start.frameW / Math.max(1, start.frameH);
    if ((hasW || hasE) && (hasN || hasS)) {
        const fixedX = hasW ? right : left;
        const fixedY = hasN ? bottom : top;
        const desiredW = Math.max(MIN_FRAME_SIZE, Math.abs(mouseCanvas.x - fixedX));
        const desiredH = Math.max(MIN_FRAME_SIZE, Math.abs(mouseCanvas.y - fixedY));
        let newW = desiredW;
        let newH = newW / aspect;
        if (newH < desiredH) {
            newH = desiredH;
            newW = newH * aspect;
        }
        return { x: hasW ? fixedX - newW : fixedX, y: hasN ? fixedY - newH : fixedY, w: newW, h: newH };
    }

    if (hasW || hasE) {
        const fixedX = hasW ? right : left;
        const newW = Math.max(MIN_FRAME_SIZE, Math.abs(mouseCanvas.x - fixedX));
        const newH = newW / aspect;
        return { x: hasW ? fixedX - newW : fixedX, y: cy - newH / 2, w: newW, h: newH };
    }

    if (hasN || hasS) {
        const fixedY = hasN ? bottom : top;
        const newH = Math.max(MIN_FRAME_SIZE, Math.abs(mouseCanvas.y - fixedY));
        const newW = newH * aspect;
        return { x: cx - newW / 2, y: hasN ? fixedY - newH : fixedY, w: newW, h: newH };
    }

    return { x: left, y: top, w: start.frameW, h: start.frameH };
}

export function handleMouseDown(event, pos, node) {
    const previewRect = node._maiFrameCanvasRect;
    const frameRect = node._maiFrameCanvasFrameRect;
    const handles = node._maiFrameCanvasHandles || [];
    if (!previewRect || !previewRect.info || !frameRect) return false;

    const point = getPoint(pos);
    const handle = findHandle(point, handles);
    if (handle) {
        const mouseCanvas = previewPointToCanvas(point, previewRect);
        const info = previewRect.info;
        node._maiFrameCanvasInteraction = {
            type: "resize",
            handle: handle.name,
            startPoint: point,
            startMouseCanvas: mouseCanvas,
            start: {
                info,
                pasteX: info.pasteX,
                pasteY: info.pasteY,
                frameW: info.frameW,
                frameH: info.frameH,
            },
        };
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return true;
    }

    const insideFrame = pointInsideRect(point, frameRect);
    const insideCanvas = pointInsideRect(point, previewRect);
    const visibleFrame = rectsIntersect(frameRect, previewRect);
    if (insideFrame && insideCanvas && visibleFrame) {
        node._maiFrameCanvasInteraction = {
            type: "move",
            startPoint: point,
            startOffsetX: Number(getValue(node, "x_offset", 0)),
            startOffsetY: Number(getValue(node, "y_offset", 0)),
            scaleFactor: previewRect.info.scaleFactor || 1,
        };
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return true;
    }

    return false;
}

export function handleMouseMove(event, pos, node) {
    const interaction = node._maiFrameCanvasInteraction;
    const previewRect = node._maiFrameCanvasRect;
    if (!interaction || !previewRect || !previewRect.info) return false;
    const point = getPoint(pos);

    if (interaction.type === "move") {
        const dxCanvas = Math.round((point.x - interaction.startPoint.x) / previewRect.scale);
        const dyCanvas = Math.round((point.y - interaction.startPoint.y) / previewRect.scale);
        setValue(node, "x_offset", interaction.startOffsetX + Math.round(dxCanvas / interaction.scaleFactor));
        setValue(node, "y_offset", interaction.startOffsetY + Math.round(dyCanvas / interaction.scaleFactor));
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return true;
    }

    if (interaction.type === "resize") {
        const mouseCanvas = previewPointToCanvas(point, previewRect);
        const keepAspect = !event?.shiftKey;
        const next = resizeFromHandle(interaction.start, mouseCanvas, interaction.handle, keepAspect);
        applyTargetTransform(node, interaction.start.info, next.x, next.y, next.w, next.h);
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return true;
    }

    return false;
}

export function handleMouseUp(event, node) {
    if (!node._maiFrameCanvasInteraction) return false;
    node._maiFrameCanvasInteraction = null;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return true;
}

export function handleWheel(event, pos, node) {
    const previewRect = node._maiFrameCanvasRect;
    const image = node._maiFrameCanvasImage;
    if (!previewRect || !previewRect.info || !image) return false;
    const point = getPoint(pos);
    if (!pointInsideRect(point, previewRect)) return false;

    const infoBefore = getCanvasInfo(node, image);
    const mouseCanvasX = (point.x - previewRect.x) / previewRect.scale;
    const mouseCanvasY = (point.y - previewRect.y) / previewRect.scale;
    const u = (mouseCanvasX - infoBefore.pasteX) / infoBefore.frameW;
    const v = (mouseCanvasY - infoBefore.pasteY) / infoBefore.frameH;
    const deltaY = event?.deltaY ?? -event?.wheelDelta ?? 0;
    const zoomFactor = deltaY > 0 ? 1 / 1.08 : 1.08;
    const newW = clamp(infoBefore.frameW * zoomFactor, MIN_FRAME_SIZE, 16384);
    const newH = clamp(infoBefore.frameH * zoomFactor, MIN_FRAME_SIZE, 16384);

    const newPasteX = mouseCanvasX - u * newW;
    const newPasteY = mouseCanvasY - v * newH;
    applyTargetTransform(node, infoBefore, newPasteX, newPasteY, newW, newH);

    event?.preventDefault?.();
    event?.stopPropagation?.();
    return true;
}
