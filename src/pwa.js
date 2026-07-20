if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
      registration.update().catch(() => {});
    } catch (error) {
      console.warn("Queens offline registration failed", error);
    }
  });
}
