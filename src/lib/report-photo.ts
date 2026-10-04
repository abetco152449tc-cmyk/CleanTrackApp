import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export async function compressReportPhoto(uri: string, width: number, height: number) {
  for (const size of [800, 600, 400]) {
    const context = ImageManipulator.manipulate(uri);
    const scale = Math.min(1, size / Math.max(width, height));
    context.resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    });
    const rendered = await context.renderAsync();
    const image = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.55,
      base64: true,
    });
    const dataUrl = `data:image/jpeg;base64,${image.base64 ?? ''}`;
    if (image.base64 && dataUrl.length <= 240000) return dataUrl;
  }
  throw Error('This photo is too large. Choose a simpler or smaller photo.');
}
