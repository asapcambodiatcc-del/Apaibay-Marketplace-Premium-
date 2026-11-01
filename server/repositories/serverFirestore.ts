import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  runTransaction,
  serverTimestamp,
  Firestore,
} from 'firebase/firestore';

interface FirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

function loadConfig(): FirebaseConfig {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  }
  throw new Error('firebase-applet-config.json not found');
}

export const firebaseConfig = loadConfig();

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// CRITICAL: Connect to the specific database configured for the project
export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  runTransaction,
  serverTimestamp,
};
