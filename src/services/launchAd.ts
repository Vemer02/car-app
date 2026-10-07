import { AppState } from 'react-native';
import { AdTheme, AppOpenAdLoader } from 'yandex-mobile-ads';
import { database } from '../db';
import { ADS_ENABLED, ADS_LAUNCH_COOLDOWN_MIN, ADS_LOAD_TIMEOUT_MS, YANDEX_APP_OPEN_UNIT_ID } from '../adsConfig';
import { isCooldownOver, withTimeout } from '../utils/adsTiming';
import { initializeAds } from './ads';

const LAST_SHOWN_KEY = 'launch_ad_last_shown';
let attempted = false;

/**
 * Рекламное окно при запуске приложения — один раз за запуск процесса (не при каждом
 * возвращении из фона). Вызывается, когда человек уже вошёл, принял согласие и разблокировал
 * приложение. Правила, чтобы реклама не мешала пользоваться:
 *  - объявление загружаем не дольше ADS_LOAD_TIMEOUT_MS: не успело — просто не показываем;
 *  - не чаще раза в ADS_LAUNCH_COOLDOWN_MIN минут;
 *  - не показываем, если приложение не на переднем плане или `canShow()` говорит «нельзя»
 *    (например, сейчас открыто окно «Что нового»).
 * Любая ошибка = «рекламы нет»: реклама не должна ни ронять приложение, ни задерживать вход.
 */
export async function showLaunchAdOnce(canShow: () => boolean): Promise<void> {
  if (!ADS_ENABLED || attempted) return;
  attempted = true;
  try {
    const stored = await database.localStorage.get<number>(LAST_SHOWN_KEY);
    const last = typeof stored === 'number' ? stored : null;
    if (!isCooldownOver(last, Date.now(), ADS_LAUNCH_COOLDOWN_MIN * 60_000)) return;
    if (!(await initializeAds())) return;

    const loader = await AppOpenAdLoader.create();
    const ad = await withTimeout(
      loader.loadAd({ adUnitId: YANDEX_APP_OPEN_UNIT_ID, adTheme: AdTheme.Dark }),
      ADS_LOAD_TIMEOUT_MS,
      () => loader.cancelLoading().catch(() => {}),
    );
    if (!ad) return;
    if (!canShow() || AppState.currentState !== 'active') return;

    // Время показа запоминаем в момент самого показа, а не загрузки: если показ сорвался,
    // человек не должен лишиться рекламы на следующие минуты.
    ad.onAdShown = () => {
      database.localStorage.set(LAST_SHOWN_KEY, Date.now()).catch(() => {});
    };
    await ad.show();
  } catch {
    // реклама недоступна — молча продолжаем
  }
}
