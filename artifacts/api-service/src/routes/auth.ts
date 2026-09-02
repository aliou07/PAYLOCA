import { Router, type IRouter } from "express";
import firebasePublicConfigRouter from "./firebasePublicConfig";
/**
 * Authentification PAYLOCA.
 *
 * La création de compte et la connexion par SMS sont réalisées par Firebase
 * dans l’application web. Le serveur ne reçoit ensuite que le jeton Firebase
 * dans Authorization et le vérifie avec requireAuth. Cette route regroupe
 * donc la configuration publique nécessaire au client Firebase.
 */
const router: IRouter = Router();
router.use(firebasePublicConfigRouter);
export default router;
