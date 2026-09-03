/**
 * Point d’entrée de la connexion base de données du serveur.
 *
 * La connexion réelle est centralisée dans le package partagé @workspace/db.
 * Ce fichier donne au serveur un chemin local simple à importer et évite de
 * créer une seconde connexion ou une seconde définition de schéma.
 */

export { db, pool } from "@workspace/db";
export * from "@workspace/db";
