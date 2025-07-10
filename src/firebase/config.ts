// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDt5eXIZ6C0H5oJco_japWMV31CZIxYL00",
  authDomain: "attendance-management-sy-f20df.firebaseapp.com",
  projectId: "attendance-management-sy-f20df",
  storageBucket: "attendance-management-sy-f20df.firebasestorage.app",
  messagingSenderId: "146922385434",
  appId: "1:146922385434:web:82a87979918df378c9e1a3",
  measurementId: "G-03JC08P958"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app); 