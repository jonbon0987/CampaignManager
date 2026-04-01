// migrate_chapter1.ts
// -----------------------------------------------------------
// Restructures modules into the new Module → Submodule → Scene hierarchy.
//
// What this does:
//   1. Ensures a "Chapter 1" module exists (creates it if not present).
//   2. Converts "The First Heist", "The Duskward", and "The Last Night in
//      Skarport" from modules into submodules under Chapter 1.
//   3. Converts the existing submodule rows under "The Duskward" into
//      scene rows under the new Duskward submodule.
//   4. Optionally deletes the now-redundant old module rows.
//
// USAGE:
//   npx tsx src/lib/migrate_chapter1.ts
//
//   Set DRY_RUN=true below to preview what will happen without writing.
// -----------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const DRY_RUN = false; // set to true to preview without writing

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl, key);
const USER_ID = '6529dd61-6bca-4403-8a07-3bf8423f6d8d';

// ============================================================
// HELPERS
// ============================================================

function log(msg: string) {
  const prefix = DRY_RUN ? '[DRY RUN] ' : '';
  console.log(prefix + msg);
}

async function getModuleByTitle(title: string) {
  const { data, error } = await supabase
    .from('modules')
    .select('*')
    .eq('title', title)
    .eq('user_id', USER_ID)
    .maybeSingle();
  if (error) throw new Error(`Failed to look up module "${title}": ${error.message}`);
  return data;
}

async function getSubmodulesByModuleId(moduleId: string) {
  const { data, error } = await supabase
    .from('submodules')
    .select('*')
    .eq('module_id', moduleId)
    .eq('user_id', USER_ID)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`Failed to fetch submodules for module ${moduleId}: ${error.message}`);
  return data ?? [];
}

// ============================================================
// STEP 1: Ensure Chapter 1 parent module exists
// ============================================================

async function ensureChapter1Module(): Promise<string> {
  const CHAPTER1_TITLE = 'Chapter 1';

  const existing = await getModuleByTitle(CHAPTER1_TITLE);
  if (existing) {
    log(`✅  Found existing "${CHAPTER1_TITLE}" module (id: ${existing.id})`);
    return existing.id;
  }

  log(`➕  Creating "${CHAPTER1_TITLE}" parent module`);
  if (DRY_RUN) return 'DRY-RUN-MODULE-ID';

  const { data, error } = await supabase
    .from('modules')
    .insert({
      user_id: USER_ID,
      chapter: 'Chapter 1',
      title: CHAPTER1_TITLE,
      synopsis: 'The New Renegades arrive in Skarport, pull the Duskward job, and depart for Arborath. Covers sessions 1–4.',
      status: 'completed',
      played_session: null,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create Chapter 1 module: ${error.message}`);
  log(`✅  Created "${CHAPTER1_TITLE}" module (id: ${data.id})`);
  return data.id;
}

// ============================================================
// STEP 2: Convert a module into a submodule under Chapter 1
// ============================================================

async function convertModuleToSubmodule(
  oldTitle: string,
  sortOrder: number,
  chapter1Id: string,
  submoduleType: string,
): Promise<{ oldModuleId: string; newSubmoduleId: string }> {
  const oldModule = await getModuleByTitle(oldTitle);
  if (!oldModule) throw new Error(`Module "${oldTitle}" not found — has it already been migrated?`);

  log(`\n── Converting module "${oldTitle}" → submodule under Chapter 1`);
  log(`   synopsis:  ${oldModule.synopsis?.slice(0, 80)}...`);

  if (DRY_RUN) {
    return { oldModuleId: oldModule.id, newSubmoduleId: 'DRY-RUN-SUBMODULE-ID' };
  }

  const { data, error } = await supabase
    .from('submodules')
    .insert({
      user_id: USER_ID,
      module_id: chapter1Id,
      title: oldModule.title,
      submodule_type: submoduleType,
      summary: oldModule.synopsis,
      content: oldModule.encounters,   // encounters text → content field
      dm_notes: oldModule.dm_notes,
      sort_order: sortOrder,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to insert submodule for "${oldTitle}": ${error.message}`);

  log(`   ✅  Created submodule (id: ${data.id})`);
  return { oldModuleId: oldModule.id, newSubmoduleId: data.id };
}

// ============================================================
// STEP 3: Convert old submodule rows → scene rows
// ============================================================

async function convertSubmodulesToScenes(
  oldModuleId: string,
  parentSubmoduleId: string,
  moduleTitle: string,
) {
  const oldSubmodules = await getSubmodulesByModuleId(oldModuleId);
  log(`\n── Migrating ${oldSubmodules.length} submodule(s) from "${moduleTitle}" → scenes`);

  if (oldSubmodules.length === 0) {
    log('   (nothing to migrate)');
    return;
  }

  const scenes = oldSubmodules.map((sub) => ({
    user_id: USER_ID,
    submodule_id: parentSubmoduleId,
    title: sub.title,
    scene_type: sub.submodule_type,   // encounter | social | other → scene_type
    summary: sub.summary,
    content: sub.content,
    dm_notes: sub.dm_notes,
    sort_order: sub.sort_order,
  }));

  for (const scene of scenes) {
    log(`   ➕  Scene: "${scene.title}"`);
  }

  if (DRY_RUN) return;

  const { error } = await supabase.from('scenes').insert(scenes);
  if (error) throw new Error(`Failed to insert scenes for "${moduleTitle}": ${error.message}`);
  log(`   ✅  ${scenes.length} scene(s) inserted`);
}

// ============================================================
// STEP 4: Delete old submodule rows and module rows
// ============================================================

async function deleteOldSubmodules(oldModuleId: string, moduleTitle: string) {
  log(`\n── Deleting old submodule rows for "${moduleTitle}" (module_id: ${oldModuleId})`);
  if (DRY_RUN) return;

  const { error } = await supabase
    .from('submodules')
    .delete()
    .eq('module_id', oldModuleId)
    .eq('user_id', USER_ID);
  if (error) throw new Error(`Failed to delete old submodules for "${moduleTitle}": ${error.message}`);
  log(`   ✅  Old submodule rows deleted`);
}

async function deleteOldModule(oldModuleId: string, moduleTitle: string) {
  log(`\n── Deleting old module row: "${moduleTitle}" (id: ${oldModuleId})`);
  if (DRY_RUN) return;

  const { error } = await supabase
    .from('modules')
    .delete()
    .eq('id', oldModuleId)
    .eq('user_id', USER_ID);
  if (error) throw new Error(`Failed to delete module "${moduleTitle}": ${error.message}`);
  log(`   ✅  Old module row deleted`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log(DRY_RUN
    ? '\n🔍  DRY RUN — no changes will be written\n'
    : '\n🚀  Running Chapter 1 restructure migration\n'
  );

  // Step 1: Get or create the Chapter 1 parent module
  const chapter1Id = await ensureChapter1Module();

  // The three modules to convert, in session order
  const toConvert = [
    { title: 'The First Heist',           sortOrder: 0, type: 'heist'  },
    { title: 'The Duskward',              sortOrder: 1, type: 'dungeon' },
    { title: 'The Last Night in Skarport', sortOrder: 2, type: 'social' },
  ];

  const migrated: Array<{ title: string; oldModuleId: string; newSubmoduleId: string }> = [];

  // Step 2 + 3: Convert each module → submodule, then its submodules → scenes
  for (const item of toConvert) {
    const { oldModuleId, newSubmoduleId } = await convertModuleToSubmodule(
      item.title,
      item.sortOrder,
      chapter1Id,
      item.type,
    );
    await convertSubmodulesToScenes(oldModuleId, newSubmoduleId, item.title);
    migrated.push({ title: item.title, oldModuleId, newSubmoduleId });
  }

  // Step 4: Clean up old submodule rows, then old module rows
  for (const item of migrated) {
    await deleteOldSubmodules(item.oldModuleId, item.title);
    await deleteOldModule(item.oldModuleId, item.title);
  }

  console.log(DRY_RUN
    ? '\n✅  Dry run complete — re-run with DRY_RUN=false to apply\n'
    : '\n✅  Migration complete\n'
  );
}

main().catch((err) => {
  console.error('\n❌  Migration failed:', err.message);
  process.exit(1);
});
