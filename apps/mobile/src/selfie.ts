import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Open the front camera and return a small JPEG data URL (≈30–60 KB), or null if cancelled.
 * Throws with a friendly message when camera permission is denied.
 */
export async function takeSelfie(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera permission is needed to take your attendance selfie. Enable it in your phone settings.');
  const res = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, mediaTypes: ['images'], quality: 0.8, allowsEditing: false, exif: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const ctx = ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 480 });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.65, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('Could not process the photo. Please try again.');
  return `data:image/jpeg;base64,${out.base64}`;
}
