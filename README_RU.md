<div align="center">

# ⚡ Syncra — Современный десктоп-клиент для S3 и MinIO

**Графический клиент нового поколения для MinIO, AWS S3, Ceph, Yandex Object Storage и любых S3-совместимых хранилищ.**  
*Быстрая, удобная и эстетичная замена Cyberduck, WinSCP и неуклюжим веб-консолям.*

[![Версия](https://img.shields.io/badge/Релиз-v1.0.0-emerald?style=for-the-badge&logo=github)](https://github.com/Chistogov/syncra/releases/latest)
[![Платформа](https://img.shields.io/badge/Платформа-Windows-blue?style=for-the-badge&logo=windows)](https://github.com/Chistogov/syncra/releases/latest)
[![Лицензия: MIT](https://img.shields.io/badge/Лицензия-MIT-purple?style=for-the-badge)](LICENSE)
[![Stars](https://img.shields.io/github/stars/Chistogov/syncra?style=for-the-badge&color=gold)](https://github.com/Chistogov/syncra/stargazers)

<br/>

🇷🇺 **Русский** • 🇺🇸 **[Read in English (README.md)](README.md)**

<br/>

<!-- КНОПКИ ЗАГРУЗКИ -->
<p align="center">
  <a href="https://github.com/Chistogov/syncra/releases/download/v1.0.0/Syncra.Setup.1.0.0.exe">
    <img src="https://img.shields.io/badge/📥_Скачать_инсталлятор_(Windows)-2563eb?style=for-the-badge&logo=windows&logoColor=white" height="42" alt="Скачать Syncra Installer" />
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/Chistogov/syncra/releases/download/v1.0.0/Syncra.1.0.0.exe">
    <img src="https://img.shields.io/badge/⚡_Скачать_Portable_(Без_установки)-059669?style=for-the-badge" height="42" alt="Скачать Portable" />
  </a>
</p>
<p><sub>✨ Включает 14 дней полного ознакомительного периода Pro без регистрации и привязки карты.</sub></p>

<br/>

<img src="docs/images/01_hero_explorer.png" alt="Syncra S3 & MinIO Desktop Explorer" width="100%" style="border-radius: 10px; border: 1px solid #30363d;" />

</div>

---

## 💡 Почему именно Syncra?

Большинство графических клиентов для S3 (Cyberduck, WinSCP) создавались более 15 лет назад: они перегружены устаревшим интерфейсом, медленно отображают структуру бакетов и требуют скачивания каждого файла на диск ради малейшей правки.

**Syncra создана для решения этих проблем в современном рабочем процессе:**

---

### 🔥 1. Прямое редактирование Edit-in-Place (Автосохранение по `Ctrl + S`)
Открывайте документы Word (`.docx`), таблицы Excel (`.xlsx`), макеты Photoshop или файлы конфигураций прямо в привычных нативных программах. При нажатии **`Ctrl + S`** Syncra мгновенно перехватывает сохранение и автоматически заливает обновленный файл обратно в ваш бакет S3.

<p align="center">
  <img src="docs/images/02_edit_in_place.png" alt="Syncra прямое редактирование файлов Edit in Place" width="100%" style="border-radius: 10px; border: 1px solid #30363d;" />
</p>

---

### 💻 2. Встроенный редактор кода Monaco (Движок VS Code)
Редактируйте конфигурации JSON, YAML, SQL-запросы, скрипты Shell и код на Python прямо в облачном хранилище. Полноценная подсветка синтаксиса, номера строк и миникарта кода на базе профессионального Monaco Editor.

<p align="center">
  <img src="docs/images/03_monaco_editor.png" alt="Syncra встроенный редактор кода Monaco" width="100%" style="border-radius: 10px; border: 1px solid #30363d;" />
</p>

---

### 🚀 3. Высокопроизводительный менеджер очереди передач
Многопоточная пакетная загрузка и скачивание сотен гигабайт файлов с индикацией скорости в реальном времени, прогресс-барами и автоматическим перезапуском при сбоях сети.

<p align="center">
  <img src="docs/images/04_transfer_queue.png" alt="Syncra менеджер очереди передач" width="100%" style="border-radius: 10px; border: 1px solid #30363d;" />
</p>

---

### ⚡ 4. Мгновенный предпросмотр медиа и PDF (Quick Look)
Просматривайте документы PDF, фото высокого разрешения, 4K видео и логи по нажатию клавиши **`Space`** без скачивания на локальный диск. Интерактивная галерея поддерживает панорамирование и плавный зум.

<p align="center">
  <img src="docs/images/05_gallery_lightbox.png" alt="Syncra галерея изображений и предпросмотр" width="100%" style="border-radius: 10px; border: 1px solid #30363d;" />
</p>

---

### 📱 5. Встроенный локальный веб-сервер (Мобильный доступ)
Просматривайте и скачивайте файлы со смартфона или планшета по домашнему или офисному Wi-Fi. Никаких приложений из App Store — подключение через мобильный браузер с защитой по одноразовому 6-значному PIN-коду.

<p align="center">
  <img src="docs/images/06_mobile_web.png" alt="Syncra мобильный доступ со смартфона" width="340" style="border-radius: 20px; border: 1px solid #30363d;" />
</p>

---

## 🥊 Сравнение с аналогами

| Возможность | Syncra | Cyberduck | WinSCP | Веб-консоль S3 |
| :--- | :---: | :---: | :---: | :---: |
| **Современный UI (Темная/Светлая темы)** | **✅ Премиальный (Plane.so)** | ❌ Устаревший | ❌ Из 2000-х | ⚠️ Неудобно |
| **Прямое редактирование Word/Excel (`Ctrl+S`)** | **✅ Мгновенно в S3** | ⚠️ Нестабильно | ❌ Только скачивание | ❌ Только скачивание |
| **Встроенный редактор кода Monaco** | **✅ Прямо в бакете** | ❌ Внешний | ⚠️ Простой блокнот | ❌ Нет |
| **Пульт управления MinIO (mc GUI)** | **✅ Пользователи/IAM** | ❌ Нет | ❌ Нет | ❌ Нет |
| **Копирование `Ctrl+C` → `Ctrl+V` в Проводник** | **✅ Нативно (CF_HDROP)** | ❌ Нет | ❌ Нет | ❌ Нет |
| **Быстрый просмотр PDF и медиа (Space)** | **✅ Встроенный вьюер** | ⚠️ Медленно | ❌ Нет | ❌ Ограниченно |
| **Мобильный веб-доступ по Wi-Fi** | **✅ Есть (с PIN)** | ❌ Нет | ❌ Нет | ❌ Нет |

---

## 🌟 Возможности базовой версии (Community Edition)

* **Поддержка любых S3-хранилищ:** MinIO (локальный и удаленный), AWS S3, Ceph RADOS Gateway, Yandex Object Storage, Selectel, Wasabi, Cloudflare R2.
* **Режимы адресации:** Полная поддержка Path-Style (`s3ForcePathStyle`) и Virtual-Hosted.
* **Диагностика соединений:** Мгновенный пинг и проверка ключей кнопкой `Test Connection`.
* **Два режима отображения:** Быстрое переключение между подробной таблицей и графической сеткой карточек.
* **Управление тегами S3 (Object Tagging):** Просмотр, пакетное назначение и фильтрация объектов с поддержкой логики `AND`, `OR` и `EXACT`.
* **Drag & Drop:** Перетаскивание файлов и папок прямо из проводника Windows в окно программы.
* **Временные ссылки (Presigned URLs):** Генерация публичных защищенных ссылок на скачивание со сроком действия (15 мин, 1 час, 24 часа, 7 дней).
* **Системный буфер обмена:** Копирование файлов в Syncra (`Ctrl + C`) и прямая вставка в проводник Windows (`Ctrl + V`).

---

## 📊 Матрица версий: Community vs Pro

Syncra развивается по прозрачной модели **Open-Core**:

| Функция | Community Edition (Open Source) | Pro Edition (Официальный релиз) |
| :--- | :---: | :---: |
| **Лицензия** | Бесплатно навсегда (MIT) | Коммерческая / Lifetime ($29) |
| **Количество серверов S3** | До 3 профилей | **Неограниченно** |
| **Базовые файловые операции и бакеты** | ✅ Полный доступ | ✅ Полный доступ |
| **Предпросмотр файлов и PDF-ридер** | ✅ Полный доступ | ✅ Полный доступ |
| **Тегирование объектов S3 (Object Tagging)** | ✅ Полный доступ | ✅ Полный доступ |
| **Локальный мобильный веб-сервер** | ✅ Полный доступ | ✅ Полный доступ |
| **Прямое редактирование Edit-in-Place (`Ctrl+S`)** | ❌ Только в Pro | **✅ Полный доступ** |
| **Редактирование и сохранение в Monaco** | Режим чтения | **✅ Полное редактирование** |
| **Визуальный пульт MinIO (mc GUI)** | ❌ Только в Pro | **✅ Полный GUI-пульт** |
| **Активация по ключу оборудования (HWID)** | — | **✅ Мгновенная активация** |

> 🎁 **Каждая официальная сборка включает 14 дней полного Pro-доступа со всеми возможностями!**

---

## 📦 Быстрая загрузка готовых сборок

Установка компиляторов не требуется. Скачайте готовый дистрибутив:

* **[Скачать Syncra Setup v1.0.0 (Инсталлятор Windows)](https://github.com/Chistogov/syncra/releases/download/v1.0.0/Syncra.Setup.1.0.0.exe)**
* **[Скачать Syncra Portable v1.0.0 (.exe без установки)](https://github.com/Chistogov/syncra/releases/download/v1.0.0/Syncra.1.0.0.exe)**

---

## 🚀 Запуск из исходного кода

### Требования
* [Node.js](https://nodejs.org/) (версия 18 или новее)
* Пакетный менеджер `npm` или `yarn`

```bash
# 1. Клонировать репозиторий
git clone https://github.com/Chistogov/syncra.git
cd syncra

# 2. Установить зависимости
npm install

# 3. Запустить в режиме разработки (HMR)
npm run dev

# 4. Собрать десктопное приложение
npm run build
```

---

## 🛡 Безопасность и приватность

* **Локальное хранение учетных данных:** Все ключи доступа (`Access Key`, `Secret Key`) и адреса серверов хранятся исключительно на вашем компьютере с использованием встроенного шифрования ОС.
* **Никакой телеметрии содержимого:** Syncra соединяется напрямую с вашими серверами S3. Данные и учетные записи никогда не передаются на сторонние серверы.

---

## 📄 Лицензия

Открытая версия Syncra Community распространяется под лицензией **[MIT](LICENSE)**.
