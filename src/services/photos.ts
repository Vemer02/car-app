import { launchCamera, launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';
import { apiFetch, apiFetchBlob, ApiError, isNetworkError } from './api';

export type PhotoSource = 'camera' | 'library';

/** Ошибка, текст которой уже можно показывать человеку. */
export class PhotoError extends Error {}

// Сжимаем на телефоне ДО отправки: чек читается и при 1600 px по длинной стороне, а файл
// получается ~0,3–0,6 МБ вместо 3–6 МБ с камеры — и места на сервере меньше, и грузится быстро.
const PICKER_OPTIONS = {
  mediaType: 'photo' as const,
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.7 as const,
  includeBase64: true,
  selectionLimit: 1,
};

function pickerErrorMessage(result: ImagePickerResponse): string {
  switch (result.errorCode) {
    case 'camera_unavailable':
      return 'Камера недоступна на этом устройстве';
    case 'permission':
      return 'Нет доступа к камере или фото — разрешите его в настройках телефона';
    default:
      return 'Не удалось получить снимок. Попробуйте ещё раз';
  }
}

/**
 * Снять/выбрать фото и сразу загрузить на сервер; возвращает id фото (его и хранит запись),
 * либо null, если человек передумал. Загрузка прямо сейчас, а не "потом при синхронизации":
 * файл из временной папки камеры система может стереть, а надёжно сохранить его у себя без
 * ещё одной нативной библиотеки мы не можем. Поэтому без интернета фото не добавить —
 * об этом человеку честно говорит describePhotoError.
 */
export async function pickAndUploadPhoto(source: PhotoSource): Promise<string | null> {
  const result =
    source === 'camera'
      ? await launchCamera({ ...PICKER_OPTIONS, saveToPhotos: false })
      : await launchImageLibrary(PICKER_OPTIONS);

  if (result.didCancel) return null;
  if (result.errorCode) throw new PhotoError(pickerErrorMessage(result));
  const base64 = result.assets?.[0]?.base64;
  if (!base64) throw new PhotoError('Не удалось прочитать снимок. Попробуйте ещё раз');

  const { id } = await apiFetch<{ id: string }>('/v1/photos', { method: 'POST', body: JSON.stringify({ data: base64 }) });
  return id;
}

export function describePhotoError(err: unknown): string {
  if (err instanceof PhotoError) return err.message;
  if (isNetworkError(err)) return 'Нет связи с сервером. Чтобы добавить фото, нужен интернет — попробуйте, когда он появится';
  if (err instanceof ApiError) {
    if (err.code === 'photo_limit') return 'В гараже накопилось слишком много фото. Удалите ненужные записи с фото';
    if (err.code === 'photo_too_large' || err.status === 413) return 'Фото слишком большое';
    if (err.code === 'unsupported_media') return 'Этот формат не поддерживается — нужны JPEG, PNG или WebP';
    return `Сервер отклонил фото: ${err.message}`;
  }
  return 'Не удалось добавить фото. Попробуйте ещё раз';
}

// ---- Показ: фото защищены авторизацией, поэтому сами загружаем и отдаём как data-URI ----

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const MAX_CACHED = 40;

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read failed')));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/** Адрес картинки для <Image>. Кэшируется в памяти: id фото не меняется, содержимое — тоже. */
export function loadPhotoUri(id: string): Promise<string> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  let pending = inflight.get(id);
  if (!pending) {
    pending = apiFetchBlob(`/v1/photos/${id}`)
      .then(blobToDataUri)
      .then((uri) => {
        if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
        cache.set(id, uri);
        return uri;
      })
      .finally(() => inflight.delete(id));
    inflight.set(id, pending);
  }
  return pending;
}
