export function getCroppedImg(
  imageSrc: string,
  crop: { x: number; y: number; width: number; height: number },
  outputSize: { width: number; height: number } = { width: 512, height: 512 },
  type: "image/jpeg" | "image/png" = "image/jpeg"
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.src = imageSrc

    image.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = outputSize.width
      canvas.height = outputSize.height
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Failed to get canvas context"))
        return
      }

      const sx = (crop.x / 100) * image.naturalWidth
      const sy = (crop.y / 100) * image.naturalHeight
      const sw = (crop.width / 100) * image.naturalWidth
      const sh = (crop.height / 100) * image.naturalHeight

      ctx.drawImage(
        image,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        outputSize.width,
        outputSize.height
      )

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error("Canvas toBlob failed"))
        },
        type,
        0.92
      )
    }

    image.onerror = () => reject(new Error("Failed to load image"))
  })
}
