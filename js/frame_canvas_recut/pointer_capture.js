import { app } from "../../../scripts/app.js";
import { stopComfyMouseEvent } from "./utils.js";
import { eventToGraphPoint, findHandle, graphPointToNodeLocal, pointInsideRect } from "./geometry.js";
import { handleMouseDown, handleMouseMove, handleMouseUp, handleWheel } from "./interactions.js";

let frameCanvasCaptureInstalled = false;
let frameCanvasActiveNode = null;

function findFrameCanvasNodeUnderMouse(event, mode = "interact") {
    const graphPoint = eventToGraphPoint(event);
    if (!graphPoint || !app.graph?._nodes) return null;

    const nodes = app.graph._nodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (!node?._maiFrameCanvasNode) continue;
        if (!node._maiFrameCanvasRect || !node._maiFrameCanvasFrameRect) continue;

        const local = graphPointToNodeLocal(node, graphPoint);
        const insideNode = local.x >= 0 && local.x <= node.size[0] && local.y >= 0 && local.y <= node.size[1];
        if (!insideNode) continue;

        const previewRect = node._maiFrameCanvasRect;
        const frameRect = node._maiFrameCanvasFrameRect;
        const handles = node._maiFrameCanvasHandles || [];
        const handle = findHandle(local, handles);
        const insidePreview = pointInsideRect(local, previewRect);
        const insideFrame = pointInsideRect(local, frameRect);

        if (mode === "wheel" && insidePreview) return { node, local };
        if (mode === "interact" && (handle || (insidePreview && insideFrame))) return { node, local };
    }
    return null;
}

export function installFrameCanvasPointerCapture() {
    if (frameCanvasCaptureInstalled) return;
    const canvas = app.canvas?.canvas;
    if (!canvas) {
        setTimeout(installFrameCanvasPointerCapture, 250);
        return;
    }

    frameCanvasCaptureInstalled = true;

    const startInteraction = (event) => {
        const hit = findFrameCanvasNodeUnderMouse(event, "interact");
        if (!hit) return;
        const didStart = handleMouseDown(event, [hit.local.x, hit.local.y], hit.node);
        if (!didStart) return;
        frameCanvasActiveNode = hit.node;
        try { canvas.setPointerCapture?.(event.pointerId); } catch {}
        stopComfyMouseEvent(event);
    };

    const moveInteraction = (event) => {
        if (!frameCanvasActiveNode) return;
        const graphPoint = eventToGraphPoint(event);
        if (!graphPoint) return;
        const local = graphPointToNodeLocal(frameCanvasActiveNode, graphPoint);
        const didMove = handleMouseMove(event, [local.x, local.y], frameCanvasActiveNode);
        if (didMove) stopComfyMouseEvent(event);
    };

    const endInteraction = (event) => {
        if (!frameCanvasActiveNode) return;
        handleMouseUp(event, frameCanvasActiveNode);
        frameCanvasActiveNode = null;
        try { canvas.releasePointerCapture?.(event.pointerId); } catch {}
        stopComfyMouseEvent(event);
    };

    const wheelInteraction = (event) => {
        const hit = findFrameCanvasNodeUnderMouse(event, "wheel");
        if (!hit) return;
        const didWheel = handleWheel(event, [hit.local.x, hit.local.y], hit.node);
        if (didWheel) stopComfyMouseEvent(event);
    };

    canvas.addEventListener("pointerdown", startInteraction, { capture: true, passive: false });
    canvas.addEventListener("pointermove", moveInteraction, { capture: true, passive: false });
    canvas.addEventListener("pointerup", endInteraction, { capture: true, passive: false });
    canvas.addEventListener("pointercancel", endInteraction, { capture: true, passive: false });
    canvas.addEventListener("mousedown", startInteraction, { capture: true, passive: false });
    canvas.addEventListener("mousemove", moveInteraction, { capture: true, passive: false });
    canvas.addEventListener("mouseup", endInteraction, { capture: true, passive: false });
    canvas.addEventListener("wheel", wheelInteraction, { capture: true, passive: false });
}
