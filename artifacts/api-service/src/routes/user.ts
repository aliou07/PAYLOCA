import { Router, type IRouter } from "express";
import accountTypeRouter from "./accountType";
import sellerProfilesRouter from "./sellerProfiles";
/**
 * Routes liées au profil du compte.
 *
 * accountType gère l’espace, la date de naissance et l’âge calculé côté
 * serveur. sellerProfiles gère le profil public professionnel.
 */
const router: IRouter = Router();
router.use(accountTypeRouter);
router.use(sellerProfilesRouter);
export default router;
