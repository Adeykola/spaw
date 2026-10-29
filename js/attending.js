document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.querySelector("[data-attending-canvas]");
  const nameInput = document.querySelector("#attendee-name");
  const photoInput = document.querySelector("#attendee-photo");
  const status = document.querySelector("[data-attending-status]");
  const downloadButton = document.querySelector("[data-attending-download]");
  if (!canvas || !nameInput || !photoInput || !status || !downloadButton) return;

  const context = canvas.getContext("2d");
  const frame = new Image();
  let portrait = null;

  function drawPortrait(image, x, y, width, height) {
    const targetRatio = width / height;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;
    if (sourceRatio > targetRatio) {
      sourceWidth = image.naturalHeight * targetRatio;
      sourceX = (image.naturalWidth - sourceWidth) / 2;
    } else {
      sourceHeight = image.naturalWidth / targetRatio;
      sourceY = (image.naturalHeight - sourceHeight) / 2;
    }
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  }

  function draw() {
    if (!frame.complete || !frame.naturalWidth) return;
    const width = frame.naturalWidth;
    const height = frame.naturalHeight;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#efe8dd";
    context.fillRect(508, 1136, 1304, 1600);
    if (portrait) {
      drawPortrait(portrait, 508, 1136, 1304, 1600);
    } else {
      context.fillStyle = "#6e6255";
      context.font = "600 48px Manrope, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("YOUR PHOTO", 1160, 1936);
    }
    context.drawImage(frame, 0, 0);

    const name = nameInput.value.trim();
    if (!name) return;
    let fontSize = 100;
    context.font = `800 ${fontSize}px Manrope, Arial, sans-serif`;
    while (context.measureText(name).width > 1040 && fontSize > 40) {
      fontSize -= 2;
      context.font = `800 ${fontSize}px Manrope, Arial, sans-serif`;
    }
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `800 ${fontSize}px Manrope, Arial, sans-serif`;
    context.fillText(name, 2865, 1908, 1040);
  }

  function imageBlob() {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the picture.")), "image/png");
    });
  }

  function filename() {
    const cleanName = nameInput.value.trim().normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
    return `spaw-attending${cleanName ? `-${cleanName}` : ""}.png`;
  }

  function requireName() {
    if (!nameInput.value.trim()) {
      status.textContent = "Add your name to finish your picture.";
      nameInput.focus();
      return false;
    }
    if (!portrait) {
      status.textContent = "Add your photo to finish your picture.";
      photoInput.focus();
      return false;
    }
    return true;
  }

  async function download() {
    if (!requireName()) return null;
    const blob = await imageBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename();
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return blob;
  }

  nameInput.addEventListener("input", draw);
  photoInput.addEventListener("change", () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
      status.textContent = "Choose an image smaller than 15 MB.";
      photoInput.value = "";
      return;
    }
    const image = new Image();
    image.onload = () => {
      portrait = image;
      draw();
      status.textContent = "Photo added. Your picture is ready.";
      URL.revokeObjectURL(image.src);
    };
    image.onerror = () => {
      status.textContent = "That image could not be opened. Try another one.";
      URL.revokeObjectURL(image.src);
      photoInput.value = "";
    };
    image.src = URL.createObjectURL(file);
  });

  downloadButton.addEventListener("click", async () => {
    try {
      if (await download()) status.textContent = "Your picture has been downloaded.";
    } catch (error) {
      status.textContent = error.message || "The picture could not be downloaded.";
    }
  });

  frame.onload = () => {
    canvas.width = frame.naturalWidth;
    canvas.height = frame.naturalHeight;
    draw();
  };
  frame.onerror = () => { status.textContent = "The attendee artwork could not be loaded."; };
  frame.src = "assets/images/IWBA2.png";
  draw();
});