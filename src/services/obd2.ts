import { BleManager, Device } from 'react-native-ble-plx';

// PID-команды ELM327 (упрощённый список для MVP)
const PID_MILEAGE_SUPPORTED = false; // одометр не входит в стандартный OBD2-набор PID —
// на большинстве авто он читается по PID 0x01 0x31 (Distance since codes cleared) как приближение,
// либо через производитель-специфичные PID. Для MVP: пробег вводится вручную,
// OBD2 используется для кодов ошибок (DTC) и подтверждения активности поездки.
const PID_DTC = '03'; // Request stored Diagnostic Trouble Codes

export interface Obd2ConnectionState {
  status: 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';
  device?: Device;
  error?: string;
}

export class Obd2Service {
  private manager = new BleManager();
  private device: Device | null = null;

  async scanForDevices(onFound: (device: Device) => void, timeoutMs = 10000): Promise<void> {
    this.manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        this.manager.stopDeviceScan();
        throw error;
      }
      // ELM327-адаптеры обычно рекламируются с "OBD" или "ELM327" в имени
      if (device && device.name && /obd|elm327/i.test(device.name)) {
        onFound(device);
      }
    });

    setTimeout(() => this.manager.stopDeviceScan(), timeoutMs);
  }

  async connect(deviceId: string): Promise<Device> {
    const device = await this.manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    this.device = device;
    return device;
  }

  async readErrorCodes(): Promise<string[]> {
    if (!this.device) throw new Error('OBD2 device not connected');
    // TODO: отправить команду PID_DTC через нужную characteristic (зависит от адаптера,
    // обычно UART-service с write/notify characteristics) и распарсить ответ в DTC-коды.
    return [];
  }

  disconnect(): void {
    this.device?.cancelConnection();
    this.device = null;
  }
}

export const obd2Service = new Obd2Service();
