#!/usr/bin/env python3
"""
Паспорт собранного APK: что внутри и чем подписано. Запускается в облачной сборке после
сборки и выводит отчёт на страницу запуска (GITHUB_STEP_SUMMARY). Нужен, чтобы ДО загрузки в
RuStore увидеть то, из-за чего магазин отклоняет сборки: отладочная подпись, флаг debuggable,
лишние разрешения — и взять отпечаток подписи для проекта push в RuStore Консоли.

  python3 scripts/apk-passport.py <файл.apk>     — отчёт (не падает, только предупреждает)
  python3 scripts/apk-passport.py --selftest     — проверка разбора на встроенных образцах
"""
import glob
import os
import re
import subprocess
import sys

# SHA-256 общего отладочного ключа Android/React Native (одинаков у всех, кто не завёл свой).
DEBUG_CERT_SHA256 = "fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c"

# По списку RuStore («Типы разрешений»): их нужно декларировать с обоснованием в консоли.
SENSITIVE = {
    "POST_NOTIFICATIONS", "CAMERA", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE", "READ_MEDIA_IMAGES",
    "READ_MEDIA_VIDEO", "READ_MEDIA_AUDIO", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION",
    "ACCESS_BACKGROUND_LOCATION", "READ_CONTACTS", "WRITE_CONTACTS", "GET_ACCOUNTS", "READ_PHONE_STATE",
    "READ_PHONE_NUMBERS", "CALL_PHONE", "READ_CALL_LOG", "READ_SMS", "SEND_SMS", "RECEIVE_SMS", "RECORD_AUDIO",
    "READ_CALENDAR", "WRITE_CALENDAR", "BLUETOOTH_CONNECT", "BLUETOOTH_SCAN", "BLUETOOTH_ADVERTISE",
    "SYSTEM_ALERT_WINDOW", "QUERY_ALL_PACKAGES", "SCHEDULE_EXACT_ALARM", "REQUEST_INSTALL_PACKAGES",
    "MANAGE_EXTERNAL_STORAGE", "PACKAGE_USAGE_STATS", "WRITE_SETTINGS", "ACTIVITY_RECOGNITION", "BODY_SENSORS",
}
# Запрещённые — сборка с ними отклоняется автоматически.
FORBIDDEN = {"READ_LOGS", "INSTALL_PACKAGES", "DELETE_PACKAGES", "SET_TIME", "WRITE_SECURE_SETTINGS", "REBOOT", "MASTER_CLEAR"}
# Приложению эти разрешения не нужны вообще: в политике конфиденциальности сказано, что геолокацию, контакты,
# телефон и т. п. оно не использует. Если они появились — их принесла какая-то библиотека, и это надо убрать.
UNEXPECTED = {
    "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "ACCESS_BACKGROUND_LOCATION", "BLUETOOTH", "BLUETOOTH_ADMIN",
    "BLUETOOTH_CONNECT", "BLUETOOTH_SCAN", "BLUETOOTH_ADVERTISE", "NEARBY_WIFI_DEVICES", "READ_PHONE_STATE",
    "READ_PHONE_NUMBERS", "GET_ACCOUNTS", "READ_CONTACTS", "WRITE_CONTACTS", "READ_CALENDAR", "WRITE_CALENDAR",
    "READ_SMS", "SEND_SMS", "RECEIVE_SMS", "RECORD_AUDIO", "CAMERA", "READ_CALL_LOG", "CALL_PHONE",
}
# Обычные, которых RuStore не требует декларировать.
SAFE = {
    "INTERNET", "ACCESS_NETWORK_STATE", "ACCESS_WIFI_STATE", "CHANGE_NETWORK_STATE", "VIBRATE", "WAKE_LOCK",
    "RECEIVE_BOOT_COMPLETED", "USE_BIOMETRIC", "USE_FINGERPRINT", "FOREGROUND_SERVICE", "BROADCAST_STICKY",
    "SET_WALLPAPER", "AD_ID",
}


def find_tool(name):
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT") or ""
    candidates = sorted(glob.glob(os.path.join(sdk, "build-tools", "*", name)), key=lambda p: [int(x) if x.isdigit() else 0 for x in re.split(r"[.\-]", p.split("build-tools/")[1].split("/")[0])])
    return candidates[-1] if candidates else None


def parse_badging(text):
    info = {"permissions": [], "debuggable": False}
    m = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'", text)
    if m:
        info["package"], info["versionCode"], info["versionName"] = m.group(1), int(m.group(2)), m.group(3)
    for key, pat in (("minSdk", r"^\s*(?:min)?[sS]dkVersion:'(\d+)'"), ("targetSdk", r"^\s*targetSdkVersion:'(\d+)'"), ("label", r"^\s*application-label:'([^']*)'")):
        mm = re.search(pat, text, re.M)
        if mm:
            info[key] = mm.group(1)
    info["permissions"] = sorted(set(re.findall(r"^uses-permission(?:-sdk-23)?: name='([^']+)'", text, re.M)))
    info["debuggable"] = bool(re.search(r"^application-debuggable", text, re.M))
    mm = re.search(r"^native-code: (.+)$", text, re.M)
    info["abis"] = re.findall(r"'([^']+)'", mm.group(1)) if mm else []
    return info


def parse_certs(text):
    """Отпечатки из вывода apksigner. Форматы у версий разные: «Signer #1 …» и «Signer (minSdkVersion=…) …» —
    поэтому ищем саму строку «SHA-256 digest: …», а одинаковые отпечатки схлопываем."""
    signers, seen = [], set()
    for m in re.finditer(r"^(.*?)certificate SHA-256 digest:\s*([0-9a-fA-F]{64})", text, re.M):
        digest = m.group(2).lower()
        if digest in seen:
            continue
        seen.add(digest)
        dn = re.search(re.escape(m.group(1)) + r"certificate DN:\s*(.*)", text)
        signers.append({"sha256": digest, "dn": dn.group(1).strip() if dn else ""})
    return signers


def parse_keytool_cert(text):
    """Запасной способ: `keytool -printcert -jarfile app.apk` (работает с подписью v1, а она у нас включена)."""
    signers = []
    for block in re.split(r"(?m)^Signer #\d+:", text) or [text]:
        m = re.search(r"SHA256:\s*([0-9A-Fa-f:]{95})", block)
        if m:
            owner = re.search(r"Owner:\s*(.*)", block)
            digest = m.group(1).replace(":", "").lower()
            if all(digest != x["sha256"] for x in signers):
                signers.append({"sha256": digest, "dn": owner.group(1).strip() if owner else ""})
    return signers


def colon(hexstr):
    return ":".join(hexstr[i:i + 2] for i in range(0, len(hexstr), 2)).upper()


def classify(perm):
    short = perm.split(".")[-1]
    if short in FORBIDDEN:
        return "ЗАПРЕЩЕНО"
    if short in SENSITIVE:
        return "чувствительное — нужно обоснование"
    if short in SAFE:
        return "обычное"
    return "не в моём списке — сверьте в консоли"


def build_report(info, signers):
    lines, problems = [], []
    lines.append("## Паспорт сборки")
    lines.append("")
    lines.append(f"- Пакет: `{info.get('package', '?')}`")
    lines.append(f"- Версия: **{info.get('versionName', '?')}** (код {info.get('versionCode', '?')}) — в RuStore каждая следующая загрузка должна иметь код больше предыдущей")
    label = info.get("label", "?")
    lines.append(f"- Название под иконкой: **{label}** (в RuStore должно быть таким же)")
    lines.append(f"- Android: от {info.get('minSdk', '?')}, целевой {info.get('targetSdk', '?')}; архитектуры: {', '.join(info.get('abis', [])) or '?'}")

    lines.append("")
    lines.append("### Подпись")
    if not signers:
        problems.append("Подпись не найдена — файл не подписан.")
        lines.append("- ❌ подпись не найдена")
    for s in signers:
        is_debug = s["sha256"] == DEBUG_CERT_SHA256
        if is_debug:
            problems.append("Сборка подписана ОТЛАДОЧНЫМ ключом — RuStore её отклонит (правило 2.14).")
            lines.append("- ❌ **отладочный ключ** (общий для всех проектов React Native) — для публикации не годится")
        else:
            lines.append(f"- ✅ собственный ключ: {s['dn'] or '—'}")
        lines.append(f"- SHA-256 отпечаток (его вписывают в проект push в RuStore Консоли): `{colon(s['sha256'])}`")

    lines.append("")
    lines.append("### Проверки RuStore")
    if info.get("debuggable"):
        problems.append("В сборке включён флаг debuggable — RuStore считает это признаком вредоносного кода.")
        lines.append("- ❌ включён режим отладки (debuggable)")
    else:
        lines.append("- ✅ режим отладки выключен")

    lines.append("")
    lines.append("### Разрешения")
    forb = [p for p in info["permissions"] if classify(p) == "ЗАПРЕЩЕНО"]
    for p in forb:
        problems.append(f"Запрещённое разрешение {p} — сборка будет отклонена автоматически.")
    unexpected = [p for p in info["permissions"] if p.split(".")[-1] in UNEXPECTED]
    for p in unexpected:
        problems.append(f"Разрешение {p.split('.')[-1]} приложению не нужно и противоречит политике конфиденциальности — найдите, какая библиотека его принесла, и уберите.")
    for p in info["permissions"]:
        mark = " ⚠ **приложению не нужно**" if p in unexpected else ""
        lines.append(f"- `{p.split('.')[-1]}` — {classify(p)}{mark}")
    if not info["permissions"]:
        lines.append("- (нет)")

    if problems:
        lines += ["", "### ⚠ Что мешает публикации"] + [f"- {p}" for p in problems]
    else:
        lines += ["", "### ✅ Явных препятствий для публикации не найдено"]
    return "\n".join(lines), problems


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")


def report_for_apk(apk):
    aapt2, apksigner = find_tool("aapt2"), find_tool("apksigner")
    if not aapt2 or not apksigner:
        print("::warning::Паспорт сборки пропущен: на машине нет aapt2/apksigner.")
        return 0
    badging = run([aapt2, "dump", "badging", apk])
    certs = run([apksigner, "verify", "--print-certs", "-v", apk])
    info = parse_badging(badging.stdout)
    signers = parse_certs(certs.stdout + "\n" + certs.stderr)
    keytool_out = None
    if not signers:  # запасной путь: keytool читает подпись прямо из файла
        keytool_out = run(["keytool", "-printcert", "-jarfile", apk])
        signers = parse_keytool_cert(keytool_out.stdout)
    text, problems = build_report(info, signers)
    if not signers or "minSdk" not in info:
        # Если что-то не разобралось — показываем сырой вывод, чтобы причину было видно сразу, без гадания.
        raw = [("aapt2 dump badging (первые строки)", "\n".join(badging.stdout.splitlines()[:14]) + "\n" + badging.stderr[:400]),
               ("apksigner verify", (certs.stdout + "\n" + certs.stderr)[:1500])]
        if keytool_out is not None:
            raw.append(("keytool -printcert", (keytool_out.stdout + "\n" + keytool_out.stderr)[:1200]))
        text += "\n\n<details><summary>Сырой вывод (для диагностики)</summary>\n\n" + "\n\n".join(f"**{t}**\n```\n{b.strip()}\n```" for t, b in raw) + "\n\n</details>"
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n" + text + "\n")
    for p in problems:
        print(f"::warning title=Паспорт сборки::{p}")
    return 0


SAMPLE_BADGING = """package: name='ru.mygarazhapp.car' versionCode='57' versionName='1.2.3' platformBuildVersionName='14' compileSdkVersion='34'
sdkVersion:'23'
targetSdkVersion:'34'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.POST_NOTIFICATIONS'
uses-permission: name='android.permission.USE_BIOMETRIC'
uses-permission: name='com.google.android.gms.permission.AD_ID'
uses-permission: name='android.permission.READ_LOGS'
application-label:'CarApp'
application-label-ru:'CarApp'
native-code: 'arm64-v8a' 'armeabi-v7a'
"""
SAMPLE_CERT_DEBUG = """Verifies
Number of signers: 1
Signer #1 certificate DN: C=US, O=Android, CN=Android Debug
Signer #1 certificate SHA-256 digest: fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
Signer #1 certificate SHA-1 digest: 5e8f16062ea3cd2c4a0d547876baa6f38cabf625
"""
SAMPLE_CERT_OWN = """Number of signers: 1
Signer #1 certificate DN: CN=Badretdinov, O=Avtolyubitel
Signer #1 certificate SHA-256 digest: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
"""


def selftest():
    failures = []

    def check(cond, msg):
        print(("ok   " if cond else "FAIL ") + msg)
        if not cond:
            failures.append(msg)

    info = parse_badging(SAMPLE_BADGING)
    check(info["package"] == "ru.mygarazhapp.car" and info["versionCode"] == 57 and info["versionName"] == "1.2.3", "пакет и версия разобраны")
    check(info["label"] == "CarApp", "название под иконкой разобрано (кириллица)")
    check(info["minSdk"] == "23" and info["targetSdk"] == "34", "minSdk/targetSdk")
    check(info["abis"] == ["arm64-v8a", "armeabi-v7a"], "архитектуры")
    check(len(info["permissions"]) == 5, "5 разрешений найдено")
    check(info["debuggable"] is False, "debuggable выключен по умолчанию")
    check(parse_badging(SAMPLE_BADGING + "application-debuggable\n")["debuggable"] is True, "debuggable обнаружен")

    check(colon("abcd12") == "AB:CD:12", "отпечаток с двоеточиями")
    d = parse_certs(SAMPLE_CERT_DEBUG)
    check(len(d) == 1 and d[0]["sha256"] == DEBUG_CERT_SHA256, "отладочный отпечаток узнан")

    text, problems = build_report(info, d)
    check(any("ОТЛАДОЧНЫМ" in p for p in problems), "отладочная подпись → проблема")
    check(any("READ_LOGS" in p for p in problems), "запрещённое разрешение → проблема")
    check("POST_NOTIFICATIONS` — чувствительное" in text, "уведомления помечены как чувствительные")
    check("AD_ID` — обычное" in text and "INTERNET` — обычное" in text, "обычные разрешения не пугают")

    info2 = dict(info, permissions=[p for p in info["permissions"] if "READ_LOGS" not in p])
    text2, problems2 = build_report(info2, parse_certs(SAMPLE_CERT_OWN))
    check(problems2 == [], "собственный ключ без запрещённого → проблем нет")
    check("01:23:45:67" in text2 and "собственный ключ" in text2, "отпечаток собственного ключа показан")
    text3, problems3 = build_report(info2, [])
    check(any("не подписан" in p for p in problems3), "нет подписи → проблема")

    # --- новые варианты формата вывода ---
    check(parse_badging(SAMPLE_BADGING.replace("sdkVersion:'23'", "minSdkVersion:'23'"))["minSdk"] == "23", "minSdk при написании «minSdkVersion»")
    check(parse_badging(SAMPLE_BADGING.replace("sdkVersion:'23'", "  sdkVersion:'23'"))["minSdk"] == "23", "minSdk с отступом")
    v3 = ("Verifies\nVerified using v3 scheme (APK Signature Scheme v3): true\nNumber of signers: 1\n"
          "Signer (minSdkVersion=24, maxSdkVersion=2147483647) certificate DN: CN=Own\n"
          "Signer (minSdkVersion=24, maxSdkVersion=2147483647) certificate SHA-256 digest: " + "ab" * 32 + "\n")
    c3 = parse_certs(v3)
    check(len(c3) == 1 and c3[0]["sha256"] == "ab" * 32 and c3[0]["dn"] == "CN=Own", "формат «Signer (minSdkVersion=…)» разобран")
    dup = SAMPLE_CERT_OWN + "Signer (minSdkVersion=24) certificate SHA-256 digest: " + "0123456789abcdef" * 4 + "\n"
    check(len(parse_certs(dup)) == 1, "один и тот же отпечаток в двух форматах не дублируется")
    kt = "Owner: CN=Android Debug, O=Android, C=US\nSHA256: " + ":".join(["FA", "C6", "17", "45", "DC", "09", "03", "78", "6F", "B9", "ED", "E6", "2A", "96", "2B", "39", "9F", "73", "48", "F0", "BB", "6F", "89", "9B", "83", "32", "66", "75", "91", "03", "3B", "9C"]) + "\n"
    ck = parse_keytool_cert(kt)
    check(len(ck) == 1 and ck[0]["sha256"] == DEBUG_CERT_SHA256, "запасной разбор keytool находит отладочный отпечаток")
    bad = dict(info, permissions=info["permissions"] + ["android.permission.ACCESS_FINE_LOCATION", "android.permission.BLUETOOTH_SCAN"])
    _, pb = build_report(bad, parse_certs(SAMPLE_CERT_OWN))
    check(any("ACCESS_FINE_LOCATION" in p and "политике" in p for p in pb) and any("BLUETOOTH_SCAN" in p for p in pb), "геолокация и Bluetooth помечены как не нужные приложению")
    check(not any("POST_NOTIFICATIONS" in p or "INTERNET" in p for p in pb), "нужные разрешения проблемой не считаются")

    print("\nВСЕ ПРОШЛИ" if not failures else f"\nОШИБОК: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--selftest":
        sys.exit(selftest())
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(report_for_apk(sys.argv[1]))
