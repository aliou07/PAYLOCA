import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/firebase-public-config", (_req, res) => {
  const value = (name: string) => process.env[`VITE_FIREBASE_${name}`] || process.env[`FIREBASE_${name}`] || "";
  const config = {
    apiKey: value("API_KEY"),
    authDomain: value("AUTH_DOMAIN"),
    projectId: value("PROJECT_ID"),
    storageBucket: value("STORAGE_BUCKET"),
    messagingSenderId: value("MESSAGING_SENDER_ID"),
    appId: value("APP_ID"),
  };
  res.json({ ...config, configured: Object.values(config).every(Boolean) });
});

export default router;
