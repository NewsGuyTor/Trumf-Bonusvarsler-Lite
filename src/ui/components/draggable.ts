/**
 * Draggable corner snap functionality
 */

import type { Position } from "../../config/constants.js";

export type PositionSaveCallback = (position: Position) => Promise<void>;

const DRAG_THRESHOLD = 5; // Minimum pixels to move before considered a drag

/**
 * Make a container draggable to corners
 */
export function makeCornerDraggable(
  container: HTMLElement,
  _handle: HTMLElement,
  onPositionChange: PositionSaveCallback
): void {
  let isDragging = false;
  let hasMoved = false;
  let startX: number;
  let startY: number;
  let startLeft: number;
  let startTop: number;

  function getContainerRect(): DOMRect {
    return container.getBoundingClientRect();
  }

  function onDragStart(e: MouseEvent | TouchEvent): void {
    // Don't drag if clicking on buttons
    const target = e.target as HTMLElement;
    if (target.closest("button, a, .settings-btn, .minimize-btn, .close-btn")) {
      return;
    }

    // When minimized, allow dragging from anywhere on container
    // When expanded, only allow dragging from header
    const isMinimized = container.classList.contains("minimized");
    if (!isMinimized && !target.closest(".header")) {
      return;
    }

    isDragging = true;
    hasMoved = false;

    const rect = getContainerRect();
    startLeft = rect.left;
    startTop = rect.top;

    if (e.type === "touchstart") {
      const touch = (e as TouchEvent).touches[0];
      if (touch) {
        startX = touch.clientX;
        startY = touch.clientY;
      }
    } else {
      startX = (e as MouseEvent).clientX;
      startY = (e as MouseEvent).clientY;
    }
  }

  function onDragMove(e: MouseEvent | TouchEvent): void {
    if (!isDragging) return;

    let clientX: number;
    let clientY: number;

    if (e.type === "touchmove") {
      const touch = (e as TouchEvent).touches[0];
      if (touch) {
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        return;
      }
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    // Only start visual drag after threshold
    if (!hasMoved) {
      if (Math.abs(deltaX) < DRAG_THRESHOLD && Math.abs(deltaY) < DRAG_THRESHOLD) {
        return;
      }
      hasMoved = true;
      container.classList.add("dragging");
      // Remove position classes and use inline styles during drag
      container.classList.remove("bottom-right", "bottom-left", "top-right", "top-left");
      container.style.left = startLeft + "px";
      container.style.top = startTop + "px";
      container.style.right = "auto";
      container.style.bottom = "auto";
    }

    e.preventDefault();
    container.style.left = startLeft + deltaX + "px";
    container.style.top = startTop + deltaY + "px";
  }

  function onDragEnd(): void {
    if (!isDragging) return;
    isDragging = false;

    // If we didn't actually move, let click events handle it
    if (!hasMoved) {
      return;
    }

    container.classList.remove("dragging");

    // Calculate center of container
    const rect = getContainerRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Determine nearest corner
    const isRight = centerX > viewportWidth / 2;
    const isBottom = centerY > viewportHeight / 2;

    let position: Position;
    if (isBottom && isRight) position = "bottom-right";
    else if (isBottom && !isRight) position = "bottom-left";
    else if (!isBottom && isRight) position = "top-right";
    else position = "top-left";

    // Calculate target position in pixels
    const margin = 20;
    const targetLeft = isRight ? viewportWidth - rect.width - margin : margin;
    const targetTop = isBottom ? viewportHeight - rect.height - margin : margin;

    // Animate to target position
    container.classList.add("snapping");
    container.style.left = targetLeft + "px";
    container.style.top = targetTop + "px";

    // After animation, switch to class-based positioning
    setTimeout(() => {
      container.classList.remove("snapping");
      container.style.left = "";
      container.style.top = "";
      container.style.right = "";
      container.style.bottom = "";
      container.classList.add(position);
    }, 350);

    // Save position
    onPositionChange(position);
  }

  // Prevent click events after drag
  function onClickCapture(e: MouseEvent): void {
    if (hasMoved) {
      e.stopPropagation();
      hasMoved = false;
    }
  }

  // Mouse events - listen on container to support minimized state
  container.addEventListener("mousedown", onDragStart);
  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);
  container.addEventListener("click", onClickCapture, true);

  // Touch events
  container.addEventListener("touchstart", onDragStart, { passive: true });
  document.addEventListener("touchmove", onDragMove, { passive: false });
  document.addEventListener("touchend", onDragEnd);
}
