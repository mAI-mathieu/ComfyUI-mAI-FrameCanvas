import { HANDLE_SIZE } from "./constants.js";
import { getValue } from "./utils.js";
import { buildHandles, getCanvasInfo, getPreviewArea, rectFromFrame } from "./geometry.js";

function drawChecker(ctx, x, y, w, h) {
    const size = 16;
    ctx.save();
    for (let yy = y; yy < y + h; yy += size) {
        for (let xx = x; xx < x + w; xx += size) {
            const alt = ((Math.floor((xx - x) / size) + Math.floor((yy - y) / size)) % 2) === 0;
            ctx.fillStyle = alt ? "#2a2a2a" : "#1f1f1f";
            ctx.fillRect(xx, yy, size, size);
        }
    }
    ctx.restore();
}

function drawHandles(ctx, handles) {
    ctx.save();
    for (const handle of handles) {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(handle.x - HANDLE_SIZE / 2, handle.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
}

export function drawFrameCanvasPreview(ctx, node) {
    const area = getPreviewArea(node);
    const image = node._maiFrameCanvasImage;
    node._maiFrameCanvasRect = null;
    node._maiFrameCanvasFrameRect = null;
    node._maiFrameCanvasHandles = [];

    ctx.save();
    ctx.fillStyle = "#101010";
    ctx.fillRect(area.x, area.y, area.w, area.h);
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;
    ctx.strokeRect(area.x, area.y, area.w, area.h);

    if (!image) {
        ctx.fillStyle = "#aaa";
        ctx.font = "12px sans-serif";
        ctx.fillText("Run once to load the source frame preview.", area.x + 12, area.y + 26);
        ctx.restore();
        return;
    }

    const info = getCanvasInfo(node, image);
    const padding = 8;
    const availableW = Math.max(1, area.w - padding * 2);
    const availableH = Math.max(1, area.h - padding * 2);
    const scale = Math.min(availableW / info.canvasW, availableH / info.canvasH);
    const viewW = info.canvasW * scale;
    const viewH = info.canvasH * scale;
    const viewX = area.x + padding + (availableW - viewW) / 2;
    const viewY = area.y + padding + (availableH - viewH) / 2;
    const canvasRect = { x: viewX, y: viewY, w: viewW, h: viewH, scale, info };
    const frameRect = rectFromFrame(viewX, viewY, scale, info);
    const handles = buildHandles(frameRect);

    node._maiFrameCanvasRect = canvasRect;
    node._maiFrameCanvasFrameRect = frameRect;
    node._maiFrameCanvasHandles = handles;

    const bgR = Number(getValue(node, "background_r", 0));
    const bgG = Number(getValue(node, "background_g", 0));
    const bgB = Number(getValue(node, "background_b", 0));

    drawChecker(ctx, viewX, viewY, viewW, viewH);
    ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
    ctx.fillRect(viewX, viewY, viewW, viewH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(viewX, viewY, viewW, viewH);
    ctx.clip();
    ctx.drawImage(image, frameRect.x, frameRect.y, frameRect.w, frameRect.h);
    ctx.restore();

    const contentRect = {
        x: viewX + info.contentX * scale,
        y: viewY + info.contentY * scale,
        w: info.contentW * scale,
        h: info.contentH * scale,
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    ctx.strokeStyle = "#66ccff";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(contentRect.x, contentRect.y, contentRect.w, contentRect.h);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(frameRect.x, frameRect.y, frameRect.w, frameRect.h);
    ctx.setLineDash([]);
    drawHandles(ctx, handles);
    ctx.restore();

    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.strokeRect(viewX, viewY, viewW, viewH);
    ctx.fillStyle = "#bbb";
    ctx.font = "12px sans-serif";
    ctx.fillText(`process ${info.canvasW} × ${info.canvasH} | content ${info.contentW} × ${info.contentH} | wheel to zoom | Shift = free resize`, area.x, area.labelY);
    ctx.restore();
}
