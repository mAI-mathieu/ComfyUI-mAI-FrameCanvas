import { app } from "../../../scripts/app.js";
import { NODE_CLASS } from "./constants.js";
import { getImageUrl, hideDefaultComfyImages, markDirty } from "./utils.js";
import { drawFrameCanvasPreview } from "./drawing.js";
import { handleMouseDown, handleMouseMove, handleMouseUp, handleWheel } from "./interactions.js";
import { installFrameCanvasPointerCapture } from "./pointer_capture.js";

app.registerExtension({
    name: "mAI.FrameCanvasRecut.TargetSize.Modules",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;

        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        const originalOnExecuted = nodeType.prototype.onExecuted;
        const originalOnDrawForeground = nodeType.prototype.onDrawForeground;
        const originalOnResize = nodeType.prototype.onResize;
        const originalOnMouseDown = nodeType.prototype.onMouseDown;
        const originalOnMouseMove = nodeType.prototype.onMouseMove;
        const originalOnMouseUp = nodeType.prototype.onMouseUp;
        const originalOnMouseWheel = nodeType.prototype.onMouseWheel;
        const originalOnConnectionsChange = nodeType.prototype.onConnectionsChange;

        nodeType.prototype.onNodeCreated = function () {
            if (originalOnNodeCreated) originalOnNodeCreated.apply(this, arguments);
            this._maiFrameCanvasNode = true;
            installFrameCanvasPointerCapture();
            this.resizable = true;
            this.flags = this.flags || {};
            this.flags.resizable = true;
            this.size[0] = Math.max(this.size[0], 900);
            this.size[1] = Math.max(this.size[1], 900);
            hideDefaultComfyImages(this);
            markDirty(this);
        };

        nodeType.prototype.onConnectionsChange = function () {
            if (originalOnConnectionsChange) originalOnConnectionsChange.apply(this, arguments);
            markDirty(this);
        };

        nodeType.prototype.onExecuted = function (message) {
            if (originalOnExecuted) originalOnExecuted.apply(this, arguments);
            const images = message?.images || message?.ui?.images || [];
            if (images.length > 0) {
                const imageInfo = images[0];
                const image = new Image();
                image.onload = () => {
                    this._maiFrameCanvasImage = image;
                    hideDefaultComfyImages(this);
                    markDirty(this);
                };
                image.src = getImageUrl(imageInfo);
            }
            hideDefaultComfyImages(this);
            setTimeout(() => { hideDefaultComfyImages(this); markDirty(this); }, 50);
            setTimeout(() => { hideDefaultComfyImages(this); markDirty(this); }, 250);
        };

        nodeType.prototype.onDrawForeground = function (ctx) {
            hideDefaultComfyImages(this);
            if (originalOnDrawForeground) originalOnDrawForeground.apply(this, arguments);
            hideDefaultComfyImages(this);
            drawFrameCanvasPreview(ctx, this);
        };

        nodeType.prototype.onResize = function (size) {
            if (originalOnResize) originalOnResize.apply(this, arguments);
            markDirty(this);
            return size;
        };

        nodeType.prototype.onMouseDown = function (event, pos, graphCanvas) {
            if (handleMouseDown(event, pos, this)) return true;
            if (originalOnMouseDown) return originalOnMouseDown.apply(this, arguments);
            return false;
        };

        nodeType.prototype.onMouseMove = function (event, pos, graphCanvas) {
            if (handleMouseMove(event, pos, this)) return true;
            if (originalOnMouseMove) return originalOnMouseMove.apply(this, arguments);
            return false;
        };

        nodeType.prototype.onMouseUp = function (event, pos, graphCanvas) {
            if (handleMouseUp(event, this)) return true;
            if (originalOnMouseUp) return originalOnMouseUp.apply(this, arguments);
            return false;
        };

        nodeType.prototype.onMouseWheel = function (event, pos, graphCanvas) {
            if (handleWheel(event, pos, this)) return true;
            if (originalOnMouseWheel) return originalOnMouseWheel.apply(this, arguments);
            return false;
        };
    },
});
