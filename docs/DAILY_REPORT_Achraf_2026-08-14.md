# Daily Report — Achraf Benamrane

**Date :** 14/08/2026
**Développeur :** Achraf Benamrane

---

## ✅ Travail effectué

### 🏈 GetDraft — **Corrections client, infrastructure client, sécurité**

**Commits (15 aujourd'hui) :**

- `d8f283b` / `391d025` — feat(discover) : **Draft et Pass sur l'axe horizontal**, comme demandé par le client
- `2229cd6` / `47d663b` / `e229905` — feat(auth) : **message « aucun compte avec cet e-mail »** + **suppression du compte depuis le profil**
- `4ae6e7c` — style(discover) : bouton **Super Draft aux couleurs de l'icône** de l'application
- `470d07f` / `229822f` — fix(match) : **écran de célébration** — débordement corrigé, cercles lumineux retirés, poignée de main réduite
- `10f768c` — fix(discover) : la **célébration s'affichait avec un swipe de retard**
- `dee055a` — fix(chat) : retrait de **« Ask for a call »** — la fonctionnalité n'existe pas
- `ccf565d` / `f3cb754` — chore(eas) : **projet déplacé sous l'organisation `getdraft2`** + correction du numéro de version
- `d532bea` / `e80226d` — feat(infra) : backend sur **le compte Railway du client** + l'application pointe vers **`api.getdraft.net`**
- `b9d4b4b` — fix(security) : **en-têtes de sécurité** (HSTS, X-Frame-Options, nosniff, referrer)

**Fonctionnalités / améliorations :**

- **Draft / Pass sur l'axe horizontal.** Demande client du 13 juillet : « faire passer de haut-bas à gauche-droite ». Le geste décide désormais **horizontalement** — glisser à droite pour Drafter, à gauche pour Passer — et le tutoriel, les icônes et les boutons décrivent enfin le geste que l'application exécute réellement.
- **Suppression de compte depuis le profil.** Auparavant uniquement accessible depuis les Réglages. Les deux entrées partagent maintenant **le même code** (`useDeleteAccount`), pour qu'elles ne puissent pas diverger — une copie qui dérive est celle qui oublie de nettoyer la session locale.
- **Messages de connexion honnêtes.** Se tromper d'e-mail et se tromper de mot de passe renvoyaient le même message générique. L'application distingue désormais « aucun compte avec cet e-mail » de « mot de passe incorrect », y compris sur l'écran de mot de passe oublié.
- **Écran de célébration retravaillé** suivant les retours client : plus compact, les deux cercles lumineux retirés, poignée de main réduite, et il ne déborde plus de l'écran en coupant son propre bouton.
- **`api.getdraft.net`** : l'API répond désormais sur **un domaine appartenant au client** plutôt que sur un nom d'hôte généré par l'hébergeur. **C'est le changement qui évite qu'une décision d'hébergement coûte une publication sur le store** : jusqu'ici l'URL de l'API était compilée dans l'application, donc chaque déménagement imposait un rebuild, un nouvel AAB et un nouvel examen. Désormais c'est un simple enregistrement DNS, invisible pour les utilisateurs.
- **Backend migré sur le compte Railway du client** et **projet EAS déplacé sous `getdraft2`** — toute l'infrastructure est maintenant sous les comptes du client, plus rien de critique n'est hébergé sur les miens.
- **Rotation complète des identifiants** (9 clés) et **audit de sécurité mené en conditions réelles** : tentatives d'élévation de privilèges, IDOR, contournement admin, jetons forgés — toutes repoussées.
- **En-têtes de sécurité ajoutés.** L'API sert aussi des pages HTML (`/api/privacy`, `/api/terms`) — précisément les URL référencées depuis Play Console et ouvertes dans un navigateur par les examinateurs.

**Bugs corrigés :**

- **Régression que j'ai introduite le matin même** (`d8f283b`, livrée en versionCode 30) : j'avais changé les icônes, le tutoriel et les libellés pour indiquer gauche/droite alors que le deck décidait toujours **verticalement**. L'application demandait donc de glisser à droite pour Drafter, ce qui ne faisait que revenir à la carte précédente — aucun swipe enregistré, aucun quota consommé. J'avais mal lu deux choses : `onSwipeLeft`/`onSwipeRight` sont des noms **sémantiques** (Pass/Draft) et non des directions, et le commentaire « Easier horizontal commit » décrivait le seuil de **navigation** du carrousel, pas l'axe de décision. Corrigé au niveau du geste dans `391d025`.
- **Célébration en retard d'un swipe** : l'écran « It's a Draft! » apparaissait par-dessus la carte suivante. Le verrou de swipe durait 80 ms alors que l'aller-retour réseau prend plusieurs centaines de millisecondes ; il attend désormais la réponse du serveur.
- **Numéro de version reparti à 3** sur la nouvelle organisation EAS alors que le Play Store était déjà à 31 — passage en `appVersionSource: local` et réalignement.
- **« Ask for a call »** dans le chat promettait une fonctionnalité inexistante — retiré.

### 📋 Coordination

- **Message au client** sur l'avancement et la publication à venir.
- **Comptes et services** entièrement repris côté client (Railway, EAS, domaine).

---

## 🚧 En cours

**Tâches actuelles :**

> - **Préparation de la soumission Play Store** : captures d'écran, fiche, déclarations de contenu.
> - **Nouveau build AAB** intégrant les corrections client du jour.

**Blocage sur ces tâches :**

> - Aucun — travail en cours de mon côté.

---

## 🚧 Blocages

- **Crédit Prelude épuisé (client)** : les inscriptions par téléphone échouent pour de vrais numéros. L'inscription par e-mail fonctionne.
- **Webhooks Stripe et Didit** encore dirigés vers l'ancien hébergement — à basculer avant les premiers vrais paiements.
- **Facturation Railway** à régler par le client sous 30 jours.

---

## 💬 Message pour le client

> Journée consacrée à **vos retours** et au **transfert complet de l'infrastructure sous vos comptes**.
>
> Côté application : **Draft et Pass fonctionnent maintenant de gauche à droite** comme vous l'aviez demandé, l'écran de félicitations a été **allégé** (cercles retirés, poignée de main réduite, plus de débordement), le bouton Super Draft **reprend les couleurs de l'icône**, et il est désormais possible de **supprimer son compte directement depuis le profil**. Les messages de connexion sont aussi plus clairs : l'application dit maintenant explicitement si aucun compte n'existe avec cet e-mail.
>
> Côté technique : l'API répond désormais sur **api.getdraft.net**, un domaine qui vous appartient. C'est important pour la suite — cela signifie qu'un futur changement d'hébergement ne nécessitera **plus de nouvelle version sur le store**. L'ensemble de l'infrastructure (Railway, EAS, domaine) est maintenant sous vos comptes, et **les 9 clés d'API ont été renouvelées** puis vérifiées en production.
>
> Un **audit de sécurité** a été mené directement sur l'environnement réel : tentatives d'accès non autorisé, de contournement et d'usurpation — toutes bloquées.

---

## 📊 Suivi

| Indicateur                          | Valeur  |
| ----------------------------------- | ------- |
| ⏱️ Heures travaillées               | `12` h  |
| 🖥️ Avancement Frontend              | `98` %  |
| ⚙️ Avancement Backend               | `100` % |
| 🔐 Rotation des clés + audit         | `100` % |
| 🏗️ Infrastructure sous comptes client | `100` % |
