import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDtM0AfDvijegcsGsBBU8qWwqSCs-lGC9I",
  authDomain: "sm-earn-47c87.firebaseapp.com",
  databaseURL: "https://sm-earn-47c87-default-rtdb.firebaseio.com",
  projectId: "sm-earn-47c87",
  storageBucket: "sm-earn-47c87.firebasestorage.app",
  messagingSenderId: "115585510640",
  appId: "1:115585510640:web:54d9a0a664e6470826e635",
  measurementId: "G-4VRSJTVW0X"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();