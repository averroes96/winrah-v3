# Guide de Configuration & Migration Appwrite Database pour WINRAH

Ce guide explique comment structurer et migrer le schéma de base de données WINRAH vers **Appwrite** (Cloud ou Auto-hébergé Docker), et comment les utilisateurs peuvent récupérer la base en 1 clic.

---

## ⚡ Méthode 1 : Migration Automatique (Recommandée)

Un script de migration automatisé est inclus dans le projet. Il crée la base de données, les 6 collections, tous les attributs typés et les index de performance en une seule commande.

### 1. Obtenir une Clé API Appwrite
1. Dans votre console Appwrite, rendez-vous dans : **Votre Projet -> Paramètres (Settings) -> Clés API (API Keys)**.
2. Cliquez sur **Créer une clé API**.
3. Donnez-lui un nom (ex: `WINRAH Migration`) et activez les permissions (scopes) suivantes :
   - `databases.write`
   - `collections.write`
   - `attributes.write`
   - `indexes.write`
4. Copiez la clé API générée.

### 2. Configurer le fichier `.env`
À la racine du projet, éditez le fichier `.env` :
```env
VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=votre_project_id
VITE_APPWRITE_DATABASE_ID=winrah_db
APPWRITE_API_KEY=votre_cle_api_secrete
```

### 3. Lancer la migration
Exécutez simplement la commande suivante dans votre terminal :
```bash
npm run appwrite:migrate
```
Le script va créer automatiquement :
- La base de données `winrah_db`
- Les collections `warehouses`, `areas`, `sections`, `models`, `model_sections`, `transfers`
- L'ensemble des 45+ attributs typés (String, Integer, Float) avec leurs contraintes
- Les index de recherche rapide (notamment sur `reference_code` et `warehouse_id`)

---

## 🛠️ Méthode 2 : Déploiement via Appwrite CLI

Le fichier [`appwrite.json`](file:///Users/admin/Github/winrah-v3/appwrite.json) est présent à la racine du projet. Si vous utilisez la CLI officielle Appwrite :
```bash
appwrite login
appwrite init project
appwrite deploy collection
```

---

## 🖐️ Méthode 3 : Création Manuelle dans la Console Appwrite

Si vous préférez créer les collections manuellement :

### Collection 1 : `warehouses`
| Attribut | Type | Requis | Taille |
|---|---|---|---|
| `id` | String | Oui | 36 |
| `name` | String | Oui | 255 |
| `status` | String | Oui | 20 |
| `version` | Integer | Oui | - |
| `created_at` | String | Oui | 64 |
| `updated_at` | String | Oui | 64 |

### Collection 2 : `areas`
| Attribut | Type | Requis | Taille |
|---|---|---|---|
| `id` | String | Oui | 36 |
| `warehouse_id` | String | Oui | 36 |
| `name` | String | Oui | 255 |
| `status` | String | Oui | 20 |
| `version` | Integer | Oui | - |
| `created_at` | String | Oui | 64 |
| `updated_at` | String | Oui | 64 |

### Collection 3 : `sections`
| Attribut | Type | Requis | Taille |
|---|---|---|---|
| `id` | String | Oui | 36 |
| `area_id` | String | Oui | 36 |
| `name` | String | Oui | 255 |
| `capacity` | String | Non | 255 |
| `status` | String | Oui | 20 |
| `version` | Integer | Oui | - |
| `created_at` | String | Oui | 64 |
| `updated_at` | String | Oui | 64 |

### Collection 4 : `models`
| Attribut | Type | Requis | Taille |
|---|---|---|---|
| `id` | String | Oui | 36 |
| `warehouse_id` | String | Oui | 36 |
| `reference_code` | String | Oui | 64 |
| `name` | String | Non | 255 |
| `size_range` | String | Non | 64 |
| `price` | Float | Non | - |
| `photo_url` | String | Non | 1000 |
| `status` | String | Oui | 20 |
| `version` | Integer | Oui | - |
| `created_at` | String | Oui | 64 |
| `updated_at` | String | Oui | 64 |

### Collection 5 : `model_sections`
| Attribut | Type | Requis | Taille |
|---|---|---|---|
| `id` | String | Oui | 36 |
| `model_id` | String | Oui | 36 |
| `section_id` | String | Oui | 36 |
| `assigned_at` | String | Oui | 64 |
| `updated_at` | String | Oui | 64 |
| `version` | Integer | Oui | - |

### Collection 6 : `transfers`
| Attribut | Type | Requis | Taille |
|---|---|---|---|
| `id` | String | Oui | 36 |
| `model_id` | String | Oui | 36 |
| `from_section_id` | String | Non | 36 |
| `to_section_id` | String | Oui | 36 |
| `device_id` | String | Oui | 64 |
| `performed_by` | String | Non | 255 |
| `sync_status` | String | Oui | 20 |
| `created_at` | String | Oui | 64 |

---

## 📲 Utilisation Côté Client : Récupération en 1 Clic

Puisque les variables `VITE_APPWRITE_ENDPOINT`, `VITE_APPWRITE_PROJECT_ID` et `VITE_APPWRITE_DATABASE_ID` sont désormais compilées directement avec l'application dans `.env` :

1. L'utilisateur ouvre l'onglet **Synchronisation**.
2. Il clique simplement sur le bouton vert **"Télécharger base serveur"**.
3. L'application télécharge instantanément l'intégralité des entrepôts, zones, rayons, modèles et transferts du serveur et met à jour la base locale IndexedDB sans aucune manipulation technique.
