// react-native-rustore-push ставится из git (gitflic.ru), а этот хост недоступен из среды,
// где я проверяю код — поставить пакет и свериться с его настоящими типами я не могу.
// Эта декларация — только чтобы остальной проект проверялся по типам; реальную форму
// класса (конструктор, методы) смотрите в src/services/push.ts — именно там, в одном
// месте, и нужно будет поправить при необходимости.
declare module 'react-native-rustore-push' {
  export default class RuStorePush {
    constructor(options: { projectId: string });
    checkPushAvailability(): Promise<boolean>;
    getToken(): Promise<string>;
    deleteToken(): Promise<void>;
  }
}
