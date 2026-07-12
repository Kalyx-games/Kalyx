import { createClient } from '@supabase/supabase-js'

// L'URL du projet et la clé publique sont lues depuis le fichier .env
// (ou les variables d'environnement Vercel). Elles ne sont PAS secrètes :
// la clé publique est faite pour vivre dans le navigateur.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Tant que les deux valeurs ne sont pas renseignées, l'app affiche un écran
// « pas encore configuré » au lieu de planter.
export const isConfigured = Boolean(url && key)

// Le "client" : l'objet par lequel on parlera à la base de données.
export const supabase = isConfigured ? createClient(url, key) : null
