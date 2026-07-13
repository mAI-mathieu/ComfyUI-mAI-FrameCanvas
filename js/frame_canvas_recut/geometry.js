import { app } from "../../../scripts/app.js";
import { HANDLE_SIZE } from "./constants.js";
import { getValue } from "./utils.js";

function ceilToMultiple(value, multiple) {
    value = Math.max(1, Math.round(Number(value)));
    multiple = Math.max(1, Math.round(Number(multiple)));
    return Math.ceil(value / multiple) * multiple;
}

function floorToMultiple(value, multiple) {
    value = Math.max(1, Math.round(Number(value)));
    multiple = Math.max(1, Math.round(Number(multiple)));
    return Math.max(multiple, Math.floor(value / multiple) * multiple);
}

export function getTargetSize(node, canvasW, canvasH) {
    const targetW = Number(getValue(node, "target_width", canvasW));
    const targetH = Number(getValue(node, "target_height", canvasH));
    return { w: Math.max(1, Math.round(targetW)), h: Math.max(1, Math.round(targetH)) };
}

export function getAnchorBase(node, canvasW, canvasH, frameW, frameH) {
    const anchor = getValue(node, "anchor", "top_left");
    if (anchor === "center") return { x: Math.floor((canvasW - frameW) / 2), y: Math.floor((canvasH - frameH) / 2) };
    if (anchor === "top_center") return { x: Math.floor((canvasW - frameW) / 2), y: 0 };
    if (anchor === "bottom_center") return { x: Math.floor((canvasW - frameW) / 2), y: canvasH - frameH };
    if (anchor === "left_center") return { x: 0, y: Math.floor((canvasH - frameH) / 2) };
    if (anchor === "right_center") return { x: canvasW - frameW, y: Math.floor((canvasH - frameH) / 2) };
    return { x: 0, y: 0 };
}

export function getProcessingLayout(node, requestedCanvasW, requestedCanvasH) {
    const anchor = getValue(node, "anchor", "top_left");
    const multiple = Math.max(1, Math.round(Number(getValue(node, "processing_multiple", 32))));
    const minW = Math.max(1, Math.round(Number(getValue(node, "min_width", 512))));
    const minH = Math.max(1, Math.round(Number(getValue(node, "min_height", 512))));
    const maxW = Math.max(1, Math.round(Number(getValue(node, "max_width", 2048))));
    const maxH = Math.max(1, Math.round(Number(getValue(node, "max_height", 2048))));
    const paddingStrategy = getValue(node, "padding_strategy", "centered");

    let contentW = Math.max(1, Math.round(requestedCanvasW));
    let contentH = Math.max(1, Math.round(requestedCanvasH));
    let target = getTargetSize(node, contentW, contentH);
    let xOffset = Math.round(Number(getValue(node, "x_offset", 0)));
    let yOffset = Math.round(Number(getValue(node, "y_offset", 0)));

    const maxAlignedW = floorToMultiple(maxW, multiple);
    const maxAlignedH = floorToMultiple(maxH, multiple);
    let scale = Math.min(1.0, maxAlignedW / contentW, maxAlignedH / contentH);

    contentW = Math.max(1, Math.round(contentW * scale));
    contentH = Math.max(1, Math.round(contentH * scale));
    target = { w: Math.max(1, Math.round(target.w * scale)), h: Math.max(1, Math.round(target.h * scale)) };
    xOffset = Math.round(xOffset * scale);
    yOffset = Math.round(yOffset * scale);

    let processingW = ceilToMultiple(Math.max(contentW, minW), multiple);
    let processingH = ceilToMultiple(Math.max(contentH, minH), multiple);
    processingW = Math.min(processingW, maxAlignedW);
    processingH = Math.min(processingH, maxAlignedH);

    if (contentW > processingW || contentH > processingH) {
        const scale2 = Math.min(processingW / contentW, processingH / contentH);
        contentW = Math.max(1, Math.round(contentW * scale2));
        contentH = Math.max(1, Math.round(contentH * scale2));
        target = { w: Math.max(1, Math.round(target.w * scale2)), h: Math.max(1, Math.round(target.h * scale2)) };
        xOffset = Math.round(xOffset * scale2);
        yOffset = Math.round(yOffset * scale2);
        scale *= scale2;
    }

    const extraW = Math.max(0, processingW - contentW);
    const extraH = Math.max(0, processingH - contentH);
    let contentX = Math.floor(extraW / 2);
    let contentY = Math.floor(extraH / 2);

    if (paddingStrategy === "pad_right_bottom") {
        contentX = 0;
        contentY = 0;
    } else if (paddingStrategy === "pad_left_top") {
        contentX = extraW;
        contentY = extraH;
    } else if (paddingStrategy === "keep_anchor") {
        if (["center", "top_center", "bottom_center"].includes(anchor)) contentX = Math.floor(extraW / 2);
        else if (anchor === "right_center") contentX = extraW;
        else contentX = 0;

        if (["center", "left_center", "right_center"].includes(anchor)) contentY = Math.floor(extraH / 2);
        else if (anchor === "bottom_center") contentY = extraH;
        else contentY = 0;
    }

    return {
        processingW, processingH,
        contentX, contentY, contentW, contentH,
        targetW: target.w, targetH: target.h,
        xOffset, yOffset, scale,
    };
}

export function getCanvasInfo(node, image) {
    const requestedCanvasW = Math.max(1, Math.round(Number(getValue(node, "canvas_width", 1280))));
    const requestedCanvasH = Math.max(1, Math.round(Number(getValue(node, "canvas_height", 720))));
    const layout = getProcessingLayout(node, requestedCanvasW, requestedCanvasH);

    const canvasW = layout.processingW;
    const canvasH = layout.processingH;
    const srcW = image?.naturalWidth || image?.width || requestedCanvasW;
    const srcH = image?.naturalHeight || image?.height || requestedCanvasH;

    const base = getAnchorBase(node, layout.contentW, layout.contentH, layout.targetW, layout.targetH);

    return {
        canvasW, canvasH, srcW, srcH,
        requestedCanvasW, requestedCanvasH,
        contentX: layout.contentX,
        contentY: layout.contentY,
        contentW: layout.contentW,
        contentH: layout.contentH,
        frameW: layout.targetW,
        frameH: layout.targetH,
        pasteX: layout.contentX + base.x + layout.xOffset,
        pasteY: layout.contentY + base.y + layout.yOffset,
        baseX: layout.contentX + base.x,
        baseY: layout.contentY + base.y,
        scaleFactor: layout.scale,
    };
}

export function eventToGraphPoint(event) {
    const graphCanvas = app.canvas;
    if (!graphCanvas?.canvas) return null;
    if (typeof graphCanvas.convertEventToCanvasOffset === "function") {
        const p = graphCanvas.convertEventToCanvasOffset(event);
        return { x: p[0], y: p[1] };
    }
    const bounds = graphCanvas.canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const ds = graphCanvas.ds;
    if (ds?.scale && ds?.offset) return { x: x / ds.scale - ds.offset[0], y: y / ds.scale - ds.offset[1] };
    return { x, y };
}

export function graphPointToNodeLocal(node, graphPoint) {
    return { x: graphPoint.x - node.pos[0], y: graphPoint.y - node.pos[1] };
}

export function getControlsBottom(node) {
    let bottom = 0;
    for (const widget of node.widgets || []) {
        if (typeof widget.last_y === "number") bottom = Math.max(bottom, widget.last_y + 24);
    }
    if (bottom > 0) return bottom + 12;
    const startY = Number(node.widgets_start_y || 80);
    const widgetCount = node.widgets?.length || 0;
    return startY + widgetCount * 24 + 12;
}

export function getPreviewArea(node) {
    const margin = 12;
    const labelHeight = 20;
    const x = margin;
    const y = getControlsBottom(node);
    const w = Math.max(40, node.size[0] - margin * 2);
    const h = Math.max(40, node.size[1] - y - margin - labelHeight);
    return { x, y, w, h, labelY: y + h + 16 };
}

export function rectFromFrame(viewX, viewY, scale, info) {
    return { x: viewX + info.pasteX * scale, y: viewY + info.pasteY * scale, w: info.frameW * scale, h: info.frameH * scale };
}

export function buildHandles(frameRect) {
    const x = frameRect.x, y = frameRect.y, w = frameRect.w, h = frameRect.h;
    return [
        { name: "nw", x, y }, { name: "n", x: x + w / 2, y }, { name: "ne", x: x + w, y },
        { name: "e", x: x + w, y: y + h / 2 }, { name: "se", x: x + w, y: y + h },
        { name: "s", x: x + w / 2, y: y + h }, { name: "sw", x, y: y + h }, { name: "w", x, y: y + h / 2 },
    ];
}

export function pointInsideRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

export function rectsIntersect(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function findHandle(point, handles) {
    for (const handle of handles || []) {
        const half = HANDLE_SIZE * 0.85;
        if (point.x >= handle.x - half && point.x <= handle.x + half && point.y >= handle.y - half && point.y <= handle.y + half) return handle;
    }
    return null;
}

export function previewPointToCanvas(point, previewRect) {
    return { x: (point.x - previewRect.x) / previewRect.scale, y: (point.y - previewRect.y) / previewRect.scale };
}
