
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Language List
export const LANGUAGES = [
  // Indian Languages
  { code: 'hi', name: 'Hindi (हिंदी)', type: 'indian' },
  { code: 'bn', name: 'Bengali (বাংলা)', type: 'indian' },
  { code: 'te', name: 'Telugu (తెలుగు)', type: 'indian' },
  { code: 'mr', name: 'Marathi (मराठी)', type: 'indian' },
  { code: 'ta', name: 'Tamil (தமிழ்)', type: 'indian' },
  { code: 'gu', name: 'Gujarati (ગુજરાતી)', type: 'indian' },
  { code: 'kn', name: 'Kannada (ಕನ್ನಡ)', type: 'indian' },
  { code: 'ml', name: 'Malayalam (മലയാളം)', type: 'indian' },
  { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)', type: 'indian' },
  { code: 'or', name: 'Odia (ଓଡ଼ିଆ)', type: 'indian' },
  { code: 'as', name: 'Assamese (অসমীয়া)', type: 'indian' },
  { code: 'ur', name: 'Urdu (اردو)', type: 'indian' },
  
  // Foreign Languages
  { code: 'en', name: 'English', type: 'foreign' },
  { code: 'es', name: 'Spanish (Español)', type: 'foreign' },
  { code: 'fr', name: 'French (Français)', type: 'foreign' },
  { code: 'de', name: 'German (Deutsch)', type: 'foreign' },
  { code: 'ru', name: 'Russian (Русский)', type: 'foreign' },
  { code: 'zh', name: 'Chinese (中文)', type: 'foreign' },
  { code: 'ja', name: 'Japanese (日本語)', type: 'foreign' },
  { code: 'ar', name: 'Arabic (العربية)', type: 'foreign' },
];

const resources = {
  en: {
    translation: {
      "welcome": "Welcome Back!",
      "login": "Login",
      "register": "Create Account",
      "popular_games": "Popular Games",
      "play_now": "Play Now",
      "live": "Live",
      "win_cash": "Win Cash",
      "daily_matches": "Daily Matches",
      "host_match": "Host Match",
      "wallet": "Wallet",
      "home": "Home",
      "friends": "Friends",
      "refer": "Refer",
      "profile": "Profile",
      "settings": "Settings",
      "language": "Language",
      "logout": "Logout",
      "select_language": "Select Language",
      "mega_tournament": "MEGA TOURNAMENT",
      "join_ff": "Join Free Fire Battle Now!",
      "coming_soon": "Coming Soon"
    }
  },
  hi: {
    translation: {
      "welcome": "वापसी पर स्वागत है!",
      "login": "लॉग इन करें",
      "register": "खाता बनाएं",
      "popular_games": "लोकप्रिय खेल",
      "play_now": "अभी खेलें",
      "live": "लाइव",
      "win_cash": "नकद जीतें",
      "daily_matches": "दैनिक मैच",
      "host_match": "मैच होस्ट करें",
      "wallet": "वॉलेट",
      "home": "होम",
      "friends": "दोस्त",
      "refer": "रेफर करें",
      "profile": "प्रोफाइल",
      "settings": "सेटिंग्स",
      "language": "भाषा",
      "logout": "लॉग आउट",
      "select_language": "भाषा चुनें",
      "mega_tournament": "मेगा टूर्नामेंट",
      "join_ff": "फ्री फायर बैटल में अभी शामिल हों!",
      "coming_soon": "जल्द आ रहा है"
    }
  },
  // Add other languages here following the same structure...
  es: { translation: { "welcome": "¡Bienvenido de nuevo!", "popular_games": "Juegos Populares" } },
  fr: { translation: { "welcome": "Bon retour!", "popular_games": "Jeux Populaires" } }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "en", // default language
    fallbackLng: "en",
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;
