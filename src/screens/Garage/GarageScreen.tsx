import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  RefreshControl,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { darkTheme } from '../../theme/tokens';
import { useActiveCar } from '../../context/ActiveCarContext';
import { database } from '../../db';
import {
  carsCollection,
  serviceRecordsCollection,
  expensesCollection,
  remindersCollection,
} from '../../db/queries';
import { getGarageId, getCurrentUserId } from '../../services/auth';
import { signOutAndClear, hasPendingLocalChanges } from '../../services/session';
import { deleteAccount } from '../../services/account';
import { syncNow } from '../../db/sync';
import { useActiveGarageId } from '../../hooks/useActiveGarageId';
import {
  isBiometricLockEnabled,
  isBiometrySupported,
  enableBiometricLock,
  disableBiometricLock,
} from '../../services/biometrics';
import {
  createInviteCode,
  joinGarageByCode,
  fetchPendingRequests,
  approveJoinRequest,
  rejectJoinRequest,
  checkOwnApprovedRequests,
  fetchGarageMembers,
  leaveGarage,
  isInSharedGarage,
  type JoinRequest,
  type GarageMember,
} from '../../services/garages';
import PrimaryButton from '../../components/PrimaryButton';
import { CarIcon, PlusIcon, ChevronRightIcon, UserIcon } from '../../components/icons';
import LegalDocumentModal from '../../components/LegalDocumentModal';
import { PRIVACY_POLICY, PD_CONSENT } from '../../legal/generated';
import type { LegalDocument } from '../../legal/types';
import type Car from '../../db/models/Car';

interface NewCarForm {
  make: string;
  model: string;
  year: string;
  plateNumber: string;
  mileage: string;
}

const EMPTY_FORM: NewCarForm = { make: '', model: '', year: '', plateNumber: '', mileage: '' };

export default function GarageScreen() {
  const { cars, activeCarId, setActiveCarId } = useActiveCar();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<NewCarForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NewCarForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    isBiometricLockEnabled().then(setBiometricEnabled);
  }, []);

  async function handleToggleBiometric() {
    if (biometricBusy) return;
    setBiometricBusy(true);
    try {
      if (biometricEnabled) {
        await disableBiometricLock();
        setBiometricEnabled(false);
        return;
      }
      const supported = await isBiometrySupported();
      if (!supported) {
        Alert.alert(
          'Биометрия недоступна',
          'На этом устройстве не настроен отпечаток пальца или Face ID. Настройте биометрию в системных настройках Android и попробуйте снова.',
        );
        return;
      }
      const ok = await enableBiometricLock();
      if (ok) {
        setBiometricEnabled(true);
      } else {
        Alert.alert('Не получилось', 'Не удалось включить вход по биометрии. Попробуйте ещё раз.');
      }
    } finally {
      setBiometricBusy(false);
    }
  }

  // ---- Участники гаража ----
  const [members, setMembers] = useState<GarageMember[]>([]);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);

  const garageId = useActiveGarageId();
  const myUid = getCurrentUserId();

  const [membersRefreshing, setMembersRefreshing] = useState(false);

  // Раньше заявки на вступление обновлялись сами, живой подпиской на Firestore.
  // REST так не умеет — обновляем при открытии экрана и руками, по pull-to-refresh.
  const reloadMembers = useCallback(async () => {
    if (!garageId) {
      setMembers([]);
      setPendingRequests([]);
      return;
    }
    try {
      const [membersList, requests] = await Promise.all([fetchGarageMembers(), fetchPendingRequests()]);
      setMembers(membersList);
      setPendingRequests(requests);
    } catch {
      // нет доступа/сети — просто оставляем то, что уже было на экране
    }
  }, [garageId]);

  useEffect(() => {
    reloadMembers();
  }, [reloadMembers]);

  async function handleRefresh() {
    setMembersRefreshing(true);
    await reloadMembers();
    setMembersRefreshing(false);
  }

  // Владелец мог одобрить заявку, пока мы были офлайн — проверяем при каждом открытии Гаража.
  // Локальную базу здесь НЕ трогаем: синхронизация сама заметит смену гаража, дошлёт
  // несинхронизированное в прежний гараж и безопасно перезальёт базу (см. db/sync.ts).
  useEffect(() => {
    checkOwnApprovedRequests()
      .then((switched) => {
        if (!switched) return;
        Alert.alert('Готово', 'Вы присоединились к общему гаражу — загружаем его данные.');
        syncNow();
      })
      .catch(() => {
        // офлайн — проверим при следующем открытии
      });
  }, []);

  const [leaving, setLeaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [openLegalDoc, setOpenLegalDoc] = useState<LegalDocument | null>(null);

  function confirmLeaveGarage() {
    Alert.alert(
      'Покинуть общий гараж?',
      'Вы вернётесь в свой собственный гараж и потеряете доступ к общим автомобилям, ТО и расходам, пока вас не пригласят снова.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Покинуть',
          style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try {
              // Сначала досылаем несинхронизированное: после выхода доступа к гаражу уже не будет.
              await syncNow();
              await leaveGarage();
              Alert.alert('Готово', 'Вы вернулись в свой гараж.');
              syncNow();
            } catch {
              Alert.alert('Не получилось', 'Не удалось покинуть гараж. Проверьте соединение.');
            } finally {
              setLeaving(false);
            }
          },
        },
      ],
    );
  }

  async function openInviteModal() {
    setInviteModalOpen(true);
    setInviteLoading(true);
    setInviteCode(null);
    try {
      const code = await createInviteCode();
      setInviteCode(code);
    } catch {
      Alert.alert('Не получилось', 'Не удалось создать код приглашения. Попробуйте ещё раз.');
      setInviteModalOpen(false);
    } finally {
      setInviteLoading(false);
    }
  }

  async function shareInviteCode() {
    if (!inviteCode) return;
    try {
      await Share.share({
        message: `Присоединяйся к моему гаражу в приложении «Автолюбитель»! Код: ${inviteCode}`,
      });
    } catch {
      // пользователь закрыл шторку — ничего страшного
    }
  }

  async function handleJoinByCode() {
    if (!joinCodeInput.trim()) return;
    setJoinLoading(true);
    try {
      const result = await joinGarageByCode(joinCodeInput.trim());
      switch (result) {
        case 'requested':
          Alert.alert('Заявка отправлена', 'Дождитесь, пока владелец гаража её одобрит.');
          setJoinModalOpen(false);
          setJoinCodeInput('');
          break;
        case 'not_found':
          Alert.alert('Код не найден', 'Проверьте код и попробуйте ещё раз.');
          break;
        case 'expired':
          Alert.alert('Код истёк', 'Попросите новый код приглашения.');
          break;
        case 'already_member':
          Alert.alert('Вы уже участник', 'Вы уже состоите в этом гараже.');
          break;
        case 'own_garage':
          Alert.alert('Это ваш гараж', 'Этот код ведёт в ваш собственный гараж.');
          break;
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось отправить заявку. Проверьте соединение.');
    } finally {
      setJoinLoading(false);
    }
  }

  async function handleApprove(request: JoinRequest) {
    await approveJoinRequest(request);
    reloadMembers();
  }

  async function handleReject(request: JoinRequest) {
    await rejectJoinRequest(request);
  }

  function confirmDeleteAccount() {
    const inOwnGarage = garageId === myUid;
    const otherMembers = inOwnGarage ? members.filter((m) => m.uid !== myUid).length : 0;

    let message =
      'Будут безвозвратно удалены ваш профиль, ваш гараж со всеми автомобилями, записями о ТО, ' +
      'расходами и напоминаниями, а также учётная запись для входа.';
    if (otherMembers > 0) {
      message += `\n\nВ вашем гараже есть другие участники (${otherMembers}) — они потеряют доступ к общим данным.`;
    }
    if (!inOwnGarage) {
      message += '\n\nИз общего гаража вы будете исключены; его данные останутся у других участников.';
    }

    Alert.alert('Удалить аккаунт?', message, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Продолжить',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Точно удалить навсегда?', 'Восстановить данные будет невозможно.', [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Удалить навсегда',
              style: 'destructive',
              onPress: async () => {
                setDeletingAccount(true);
                const result = await deleteAccount();
                if (result.status === 'error') {
                  setDeletingAccount(false);
                  Alert.alert('Не удалось удалить', result.message);
                }
                // При успехе приложение само вернётся на экран входа (выход из аккаунта).
              },
            },
          ]),
      },
    ]);
  }

  async function confirmSignOut() {
    const pending = await hasPendingLocalChanges();
    Alert.alert(
      'Выйти из аккаунта?',
      pending
        ? 'Часть изменений ещё не отправлена в облако (нет связи). Если выйти сейчас, они будут потеряны.'
        : 'Данные останутся в облаке и появятся снова, когда вы войдёте.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выйти', style: pending ? 'destructive' : 'default', onPress: () => signOutAndClear() },
      ],
    );
  }

  function openForm() {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormOpen(true);
  }

  function confirmDeleteCar(car: Car) {
    Alert.alert(
      `Удалить ${car.make} ${car.model}?`,
      'Вся история ТО и расходов по этому автомобилю тоже будет удалена. Это действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            await database.write(async () => {
              const [records, expenseRows, reminderRows] = await Promise.all([
                serviceRecordsCollection.query(Q.where('car_id', car.id)).fetch(),
                expensesCollection.query(Q.where('car_id', car.id)).fetch(),
                remindersCollection.query(Q.where('car_id', car.id)).fetch(),
              ]);
              await Promise.all([
                ...records.map((r) => r.markAsDeleted()),
                ...expenseRows.map((e) => e.markAsDeleted()),
                ...reminderRows.map((r) => r.markAsDeleted()),
                car.markAsDeleted(),
              ]);
            });
            syncNow();
          },
        },
      ],
    );
  }

  function validate(): boolean {
    const errors: typeof formErrors = {};
    if (!form.make.trim()) errors.make = 'Укажите марку';
    if (!form.model.trim()) errors.model = 'Укажите модель';
    const yearNum = parseInt(form.year, 10);
    if (!form.year || Number.isNaN(yearNum) || yearNum < 1950 || yearNum > new Date().getFullYear() + 1) {
      errors.year = 'Некорректный год';
    }
    const mileageNum = parseInt(form.mileage.replace(/\D/g, ''), 10);
    if (form.mileage && Number.isNaN(mileageNum)) errors.mileage = 'Только цифры';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function saveCar() {
    if (!validate()) return;
    setSaving(true);
    try {
      const carGarageId = getGarageId() ?? '';
      const mileageNum = parseInt(form.mileage.replace(/\D/g, ''), 10) || 0;
      const yearNum = parseInt(form.year, 10);

      let createdId = '';
      await database.write(async () => {
        const record = await carsCollection.create((c) => {
          c.garageId = carGarageId;
          c.make = form.make.trim();
          c.model = form.model.trim();
          c.year = yearNum;
          c.plateNumber = form.plateNumber.trim() || undefined;
          c.currentMileage = mileageNum;
          c.createdAt = new Date();
          c.updatedAt = new Date();
        });
        createdId = record.id;
      });

      setActiveCarId(createdId);
      setFormOpen(false);
      syncNow();
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Гараж</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={membersRefreshing} onRefresh={handleRefresh} tintColor={darkTheme.accent} />
        }>
        {/* Cars */}
        <View>
          <Text style={styles.sectionLabel}>МОИ АВТОМОБИЛИ</Text>
          <Text style={styles.sectionHint}>Долгое нажатие на карточку — удалить автомобиль</Text>
          <View style={{ gap: 10 }}>
            {cars.map((car) => {
              const active = car.id === activeCarId;
              return (
                <TouchableOpacity
                  key={car.id}
                  style={[styles.carCard, active && { borderColor: darkTheme.accent }]}
                  onPress={() => setActiveCarId(car.id)}
                  onLongPress={() => confirmDeleteCar(car)}
                  delayLongPress={400}>
                  <View style={styles.carThumb}>
                    <CarIcon size={26} color={darkTheme.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.carName}>
                      {car.make} {car.model}
                    </Text>
                    <Text style={styles.carMeta}>
                      {car.currentMileage.toLocaleString('ru-RU')} км
                      {car.plateNumber ? ` · ${car.plateNumber}` : ''}
                    </Text>
                  </View>
                  {active ? (
                    <Text style={styles.activeBadge}>активна</Text>
                  ) : (
                    <ChevronRightIcon size={16} color={darkTheme.textDisabled} />
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.addCarButton} onPress={openForm}>
              <PlusIcon size={16} color={darkTheme.textSecondary} />
              <Text style={styles.addCarText}>Добавить автомобиль</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Members */}
        <View>
          <Text style={styles.sectionLabel}>УЧАСТНИКИ ГАРАЖА</Text>
          <View style={styles.settingsCard}>
            {members.map((m, i) => (
              <View key={m.uid}>
                {i > 0 && <View style={styles.settingsDivider} />}
                <View style={styles.memberRow}>
                  <View style={styles.memberAvatar}>
                    <UserIcon size={16} color={darkTheme.textSecondary} />
                  </View>
                  <Text style={styles.memberEmail} numberOfLines={1}>
                    {m.email}
                  </Text>
                  {m.uid === myUid && <Text style={styles.youBadge}>вы</Text>}
                </View>
              </View>
            ))}
          </View>

          {pendingRequests.length > 0 && (
            <View style={{ marginTop: 10, gap: 8 }}>
              {pendingRequests.map((req) => (
                <View key={req.id} style={styles.requestRow}>
                  <Text style={styles.requestEmail} numberOfLines={1}>
                    {req.email || 'Новый пользователь'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={styles.requestBtnReject} onPress={() => handleReject(req)}>
                      <Text style={styles.requestBtnRejectText}>Отклонить</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.requestBtnApprove} onPress={() => handleApprove(req)}>
                      <Text style={styles.requestBtnApproveText}>Принять</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.memberActionsRow}>
            <PrimaryButton title="Пригласить" variant="secondary" onPress={openInviteModal} style={{ flex: 1 }} />
            <PrimaryButton
              title="У меня есть код"
              variant="secondary"
              onPress={() => setJoinModalOpen(true)}
              style={{ flex: 1 }}
            />
          </View>

          {isInSharedGarage(garageId) && (
            <PrimaryButton
              title="Покинуть общий гараж"
              variant="secondary"
              onPress={confirmLeaveGarage}
              loading={leaving}
              style={{ marginTop: 10, borderColor: darkTheme.danger }}
            />
          )}
        </View>

        {/* Settings */}
        <View>
          <Text style={styles.sectionLabel}>НАСТРОЙКИ</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={handleToggleBiometric}
              disabled={biometricBusy}>
              <Text style={styles.settingsLabel}>Вход по биометрии</Text>
              <View style={[styles.toggle, biometricEnabled && { backgroundColor: darkTheme.accent }]}>
                <View style={[styles.toggleKnob, biometricEnabled && { alignSelf: 'flex-end' }]} />
              </View>
            </TouchableOpacity>

            <View style={styles.settingsDivider} />

            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Язык</Text>
              <Text style={styles.settingsValue}>Русский</Text>
            </View>

            <View style={styles.settingsDivider} />

            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Единицы измерения</Text>
              <Text style={styles.settingsValue}>км, л, ₽</Text>
            </View>
          </View>
        </View>

        <View>
          <Text style={styles.sectionLabel}>ПРАВОВАЯ ИНФОРМАЦИЯ</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingsRow} onPress={() => setOpenLegalDoc(PRIVACY_POLICY)}>
              <Text style={styles.settingsLabel}>Политика конфиденциальности</Text>
              <ChevronRightIcon size={16} color={darkTheme.textDisabled} />
            </TouchableOpacity>
            <View style={styles.settingsDivider} />
            <TouchableOpacity style={styles.settingsRow} onPress={() => setOpenLegalDoc(PD_CONSENT)}>
              <Text style={styles.settingsLabel}>Согласие на обработку данных</Text>
              <ChevronRightIcon size={16} color={darkTheme.textDisabled} />
            </TouchableOpacity>
          </View>
        </View>

        <PrimaryButton title="Выйти из аккаунта" variant="secondary" onPress={confirmSignOut} />
        <PrimaryButton
          title="Удалить аккаунт и все данные"
          variant="secondary"
          onPress={confirmDeleteAccount}
          loading={deletingAccount}
          style={{ borderColor: darkTheme.danger }}
        />
      </ScrollView>

      <LegalDocumentModal document={openLegalDoc} onClose={() => setOpenLegalDoc(null)} />

      {/* Add car modal */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={styles.formSheet}
            contentContainerStyle={{ paddingBottom: 28 }}
            keyboardShouldPersistTaps="handled">
            <Text style={styles.formTitle}>Новый автомобиль</Text>

            <Field label="Марка" value={form.make} onChangeText={(v) => setForm((f) => ({ ...f, make: v }))} error={formErrors.make} placeholder="Toyota" />
            <Field label="Модель" value={form.model} onChangeText={(v) => setForm((f) => ({ ...f, model: v }))} error={formErrors.model} placeholder="Camry" />
            <Field
              label="Год выпуска"
              value={form.year}
              onChangeText={(v) => setForm((f) => ({ ...f, year: v.replace(/\D/g, '') }))}
              error={formErrors.year}
              placeholder="2021"
              keyboardType="number-pad"
            />
            <Field
              label="Гос. номер (необязательно)"
              value={form.plateNumber}
              onChangeText={(v) => setForm((f) => ({ ...f, plateNumber: v }))}
              placeholder="А 123 БВ 777"
              autoCapitalize="characters"
            />
            <Field
              label="Текущий пробег"
              value={form.mileage}
              onChangeText={(v) => setForm((f) => ({ ...f, mileage: v.replace(/\D/g, '') }))}
              error={formErrors.mileage}
              placeholder="0"
              keyboardType="number-pad"
            />

            <View style={styles.formButtonsRow}>
              <PrimaryButton title="Отмена" variant="secondary" onPress={() => setFormOpen(false)} style={{ flex: 1 }} />
              <PrimaryButton title="Добавить" onPress={saveCar} loading={saving} style={{ flex: 1 }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Invite modal */}
      <Modal visible={inviteModalOpen} transparent animationType="fade" onRequestClose={() => setInviteModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.inviteSheet}>
            <Text style={styles.formTitle}>Пригласить в гараж</Text>
            {inviteLoading ? (
              <Text style={styles.settingsValue}>Создаём код…</Text>
            ) : inviteCode ? (
              <>
                <Text style={styles.inviteHint}>Отправьте этот код тому, кого хотите добавить:</Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText}>{inviteCode}</Text>
                </View>
                <Text style={styles.inviteHint}>Код действует 7 дней.</Text>
              </>
            ) : null}
            <View style={styles.formButtonsRow}>
              <PrimaryButton title="Закрыть" variant="secondary" onPress={() => setInviteModalOpen(false)} style={{ flex: 1 }} />
              {inviteCode && (
                <PrimaryButton title="Поделиться" onPress={shareInviteCode} style={{ flex: 1 }} />
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Join by code modal */}
      <Modal visible={joinModalOpen} transparent animationType="slide" onRequestClose={() => setJoinModalOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.inviteSheet}>
            <Text style={styles.formTitle}>Вступить по коду</Text>
            <TextInput
              value={joinCodeInput}
              onChangeText={(v) => setJoinCodeInput(v.toUpperCase())}
              placeholder="ABCD12"
              placeholderTextColor={darkTheme.textDisabled}
              autoCapitalize="characters"
              maxLength={6}
              style={[styles.fieldInput, { textAlign: 'center', fontSize: 20, letterSpacing: 4, fontWeight: '700' }]}
            />
            <View style={styles.formButtonsRow}>
              <PrimaryButton
                title="Отмена"
                variant="secondary"
                onPress={() => {
                  setJoinModalOpen(false);
                  setJoinCodeInput('');
                }}
                style={{ flex: 1 }}
              />
              <PrimaryButton title="Отправить заявку" onPress={handleJoinByCode} loading={joinLoading} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
  autoCapitalize?: 'none' | 'characters' | 'words' | 'sentences';
}

function Field({ label, value, onChangeText, error, placeholder, keyboardType, autoCapitalize }: FieldProps) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={darkTheme.textDisabled}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[styles.fieldInput, error ? { borderColor: darkTheme.danger } : null]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkTheme.background },
  header: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: darkTheme.textPrimary },
  content: { padding: 20, paddingTop: 14, gap: 22, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: darkTheme.textDisabled,
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 12,
    color: darkTheme.textDisabled,
    marginTop: -4,
    marginBottom: 10,
  },
  carCard: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  carThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: darkTheme.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carName: { fontSize: 15, fontWeight: '700', color: darkTheme.textPrimary },
  carMeta: { fontSize: 12, color: darkTheme.textSecondary, marginTop: 2 },
  activeBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: darkTheme.accent,
    backgroundColor: darkTheme.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    textTransform: 'uppercase',
  },
  addCarButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: darkTheme.border,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addCarText: { fontSize: 14, fontWeight: '600', color: darkTheme.textSecondary },
  settingsCard: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  settingsDivider: { height: 1, backgroundColor: darkTheme.border },
  settingsLabel: { fontSize: 14, fontWeight: '600', color: darkTheme.textPrimary },
  settingsValue: { fontSize: 13, color: darkTheme.textSecondary },
  toggle: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: darkTheme.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  memberAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: darkTheme.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberEmail: { flex: 1, fontSize: 14, fontWeight: '600', color: darkTheme.textPrimary },
  youBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: darkTheme.textSecondary,
    backgroundColor: darkTheme.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    textTransform: 'uppercase',
  },
  memberActionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  requestRow: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.accent,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  requestEmail: { flex: 1, fontSize: 13, fontWeight: '600', color: darkTheme.textPrimary },
  requestBtnApprove: { backgroundColor: darkTheme.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  requestBtnApproveText: { fontSize: 12, fontWeight: '700', color: darkTheme.background },
  requestBtnReject: {
    borderWidth: 1,
    borderColor: darkTheme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  requestBtnRejectText: { fontSize: 12, fontWeight: '600', color: darkTheme.textSecondary },
  inviteSheet: {
    backgroundColor: darkTheme.surfaceElevated,
    borderRadius: 20,
    padding: 20,
    margin: 20,
    alignSelf: 'center',
    width: '90%',
  },
  inviteHint: { fontSize: 13, color: darkTheme.textSecondary, marginBottom: 12, textAlign: 'center' },
  codeBox: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  codeText: { fontSize: 28, fontWeight: '800', letterSpacing: 6, color: darkTheme.accent },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  formSheet: {
    backgroundColor: darkTheme.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  formTitle: { fontSize: 18, fontWeight: '700', color: darkTheme.textPrimary, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: darkTheme.textSecondary, marginBottom: 6 },
  fieldInput: {
    height: 50,
    borderRadius: 12,
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    color: darkTheme.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
  },
  fieldError: { fontSize: 12, color: darkTheme.danger, marginTop: 6 },
  formButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
