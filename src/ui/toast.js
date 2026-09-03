export function createToast() {
  let toastEl = null;
  let toastTimer = null;

  return function showToast(message, isError = false, duration = 2000) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast-message";
      document.body.appendChild(toastEl);
    }

    toastEl.textContent = message;
    toastEl.classList.toggle("is-error", isError);
    toastEl.classList.remove("show");
    void toastEl.offsetWidth;
    toastEl.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, duration);
  };
}
