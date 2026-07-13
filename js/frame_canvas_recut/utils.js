import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function getWidget(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

export function getLinkedInputValue(node, name) {
    const input = node.inputs?.find((i) => i.name === name);
    if (!input || input.link == null) return undefined;
    const link = app.graph?.links?.[input.link];
    if (!link) return undefined;
    const originNode = app.graph.getNodeById?.(link.origin_id);
    if (!originNode) return undefined;

    if (originNode.widgets && originNode.widgets.length > 0) {
        const preferredNames = new Set(["value", "int", "float", "number", "width", "height"]);
        for (const widget of originNode.widgets) {
            if (preferredNames.has(String(widget.name || "").toLowerCase())) return widget.value;
        }
        for (const widget of originNode.widgets) {
            if (["number", "slider", "combo", "text"].includes(widget.type)) return widget.value;
        }
        return originNode.widgets[0].value;
    }

    if (originNode.properties) {
        if (originNode.properties.value !== undefined) return originNode.properties.value;
        if (originNode.properties[name] !== undefined) return originNode.properties[name];
    }

    return undefined;
}

export function getValue(node, name, fallback) {
    const linkedValue = getLinkedInputValue(node, name);
    if (linkedValue !== undefined && linkedValue !== null) return linkedValue;
    const widget = getWidget(node, name);
    return widget ? widget.value : fallback;
}

export function setValue(node, name, value) {
    const widget = getWidget(node, name);
    if (!widget) return;
    widget.value = value;
    if (widget.callback) widget.callback(value, app.canvas, node);
    markDirty(node);
}

export function markDirty(node) {
    if (node?.setDirtyCanvas) node.setDirtyCanvas(true, true);
    if (app?.canvas?.setDirty) app.canvas.setDirty(true, true);
}

export function stopComfyMouseEvent(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
}

export function getImageUrl(imageInfo) {
    const params = new URLSearchParams();
    params.set("filename", imageInfo.filename);
    params.set("type", imageInfo.type || "temp");
    params.set("subfolder", imageInfo.subfolder || "");
    params.set("rand", Math.random().toString());
    return api.apiURL(`/view?${params.toString()}`);
}

export function getPoint(pos) {
    if (Array.isArray(pos)) return { x: pos[0], y: pos[1] };
    if (pos && typeof pos === "object") return { x: pos.x ?? pos[0] ?? 0, y: pos.y ?? pos[1] ?? 0 };
    return { x: 0, y: 0 };
}

export function hideDefaultComfyImages(node) {
    node.imgs = [];
    node.imageIndex = null;
}
