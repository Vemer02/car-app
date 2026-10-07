import { useEffect, useState } from 'react';
import { loadPhotoUri } from '../services/photos';

/** Адрес фото по id: undefined — ещё грузится, null — не удалось (нет связи / фото нет). */
export function usePhotoUri(id: string | null | undefined): string | null | undefined {
  const [uri, setUri] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!id) {
      setUri(null);
      return;
    }
    let cancelled = false;
    setUri(undefined);
    loadPhotoUri(id)
      .then((u) => !cancelled && setUri(u))
      .catch(() => !cancelled && setUri(null));
    return () => {
      cancelled = true;
    };
  }, [id]);
  return uri;
}
