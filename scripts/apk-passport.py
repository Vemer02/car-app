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
    for key, pat in (("minSdk", r"^sdkVersion:'(\d+)'"), ("targetSdk", r"^targetSdkVersion:'(\d+)'"), ("label", r"^application-label:'([^']*)'")):
        mm = re.search(pat, text, re.M)
        if mm:
            info[key] = mm.group(1)
    info["permissions"] = sorted(set(re.findall(r"^uses-permission(?:-sdk-23)?: name='([^']+)'", text, re.M)))
    info["debuggable"] = bool(re.search(r"^application-debuggable", text, re.M))
    mm = re.search(r"^native-code: (.+)$", text, re.M)
    info["abis"] = re.findall(r"'([^']+)'", mm.group(1)) if mm else []
    return info


def parse_certs(text):
    signers = []
    for m in re.finditer(r"Signer #(\d+) certificate SHA-256 digest: ([0-9a-fA-F]+)", text):
        dn = re.search(rf"Signer #{m.group(1)} certificate DN: (.*)", text)
        signers.append({"sha256": m.group(2).lower(), "dn": dn.group(1).strip() if dn else ""})
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
    for p in info["permissions"]:
        lines.append(f"- `{p.split('.')[-1]}` — {classify(p)}")
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
    signers = parse_certs(certs.stdout)
    text, problems = build_report(info, signers)
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

    print("\nВСЕ ПРОШЛИ" if not failures else f"\nОШИБОК: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--selftest":
        sys.exit(selftest())
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(report_for_apk(sys.argv[1]))
