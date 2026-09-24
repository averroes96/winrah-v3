# Guide de Configuration Appwrite Database pour WINRAH

Ce guide vous permet de connecter WINRAH à votre instance **Appwrite** (Appwrite Cloud ou Auto-hébergé / Self-hosted).

---

## 1. Création du Projet & de la Base de Données

1. Rendez-vous sur votre console Appwrite (ex: [cloud.appwrite.io](https://cloud.appwrite.io) ou votre instance Docker).
2. Créez un nouveau projet (ex: **WINRAH**).
3. Notez le **Project ID** généré.
4. Rendez-vous dans le menu **Databases** et créez une nouvelle base de données :
   - **Database ID** : `winrah_db` (ou l'identifiant de votre choix).

---

## 2. Création des Collections & Attributs

Dans la base `winrah_db`, créez les 6 collections suivantes et autorisez les permissions d'accès (ex: Rôle `Any` ou `Users` en Lecture/Écriture) :

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
| `performed_by` | String | Oui | 255 |
| `sync_status` | String | Oui | 20 |
| `created_at` | String | Oui | 64 |

---

## 3. Configuration dans WINRAH

Ouvrez l'onglet **Synchronisation** dans l'application WINRAH :
1. **Endpoint** : `https://cloud.appwrite.io/v1` (ou votre adresse `http://192.168.x.x/v1`)
2. **Project ID** : Votre ID de projet Appwrite
3. **Database ID** : `winrah_db`
4. Cliquez sur **Tester la connexion** puis sur **Enregistrer configuration**.
