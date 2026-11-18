import { FormElementOptions } from "./interface/form";
import { addStartScreenSection } from "./interface/start_screen";
import { currentwindow } from "./native_apis";
import { getDateDisplay } from "./util/util";

const backupInterval = 300_000;
const retentionSeconds = 3 * 24 * 60 * 60;

type ProjectSave = {
	uuid: UUID
	data: string
	name?: string
	date?: number
}

//Backup
export const AutoBackup = {
	/**
	 * IndexedDB Database
	 */
	db: null as (null | IDBDatabase),
	initialize(): void {
		let request = indexedDB.open('auto_backups', 1);
		request.onerror = function(e) {
			console.error('Failed to load backup database', e);
		}
		request.onblocked = function(e) {
			console.error('Another instance of Blockbench is opened, the backup database cannot be upgraded at the moment');
		}
		request.onupgradeneeded = function() {
			let db = request.result;
			let store = db.createObjectStore('projects', {keyPath: 'uuid'});

			// Legacy system
			let backup_models = localStorage.getItem('backup_model')
			if (backup_models) {
				let parsed_backup_models = JSON.parse(backup_models);
				for (let uuid in parsed_backup_models) {
					let model = JSON.stringify(parsed_backup_models[uuid]);
					store.put({uuid, data: model});
				}
				console.log(`Upgraded ${Object.keys(parsed_backup_models).length} project back-ups to indexedDB`);
			}
		}
		request.onsuccess = async function() {
			AutoBackup.db = request.result;
			await AutoBackup.pruneExpired();
			
			// Start Screen Message
			let has_backups = await AutoBackup.hasBackups();
			// @ts-expect-error
			if (has_backups && (!isApp || !currentwindow.webContents.second_instance)) {

				let section = addStartScreenSection('recover_backup', {
					graphic: {type: 'icon', icon: 'fa-archive'},
					insert_before: 'start_files',
					text: [
						{type: 'h3', text: tl('message.recover_backup.title')},
						{type: 'p', text: tl('message.recover_backup.message')},
						{type: 'button', text: tl('message.recover_backup.recover'), click: () => {
							AutoBackup.recoverAllBackups(true).then(() => {
								section.delete();
							});
						}},
						{type: 'button', text: tl('dialog.discard'), click: () => {
							AutoBackup.removeAllBackups();
							section.delete();
						}}
					]
				})
			}

			AutoBackup.backupProjectLoop(false);
		}
	},
	async backupOpenProject() {
		if (!AutoBackup.db || !Project || Project.saved) return;

		let model = Codecs.project.compile({compressed: false, backup: true, raw: true});
		let model_json = JSON.stringify(model);
		let project_save: ProjectSave = {
			uuid: Project.uuid,
			data: model_json,
			name: Project.name,
			date: Math.round(Date.now() / 1000)
		}
		let transaction = AutoBackup.db.transaction('projects', 'readwrite');
		transaction.objectStore('projects').put(project_save);
		
		await new Promise((resolve, reject) => {
			transaction.oncomplete = resolve;
			transaction.onabort = () => reject(transaction.error);
		})
	},
	async pruneExpired() {
		if (!AutoBackup.db) return;
		const now = Math.floor(Date.now() / 1000);
		const transaction = AutoBackup.db.transaction('projects', 'readwrite');
		const request = transaction.objectStore('projects').openCursor();
		request.onsuccess = () => {
			const cursor = request.result;
			if (!cursor) return;
			const backup = cursor.value as ProjectSave;
			if (backup.date == null) cursor.update({...backup, date: now});
			else if (backup.date <= now - retentionSeconds) cursor.delete();
			cursor.continue();
		};
		await new Promise((resolve, reject) => {
			transaction.oncomplete = resolve;
			transaction.onabort = () => reject(transaction.error);
		});
	},
	/**
	 * Test if saved backups exist
	 */
	async hasBackups(): Promise<boolean> {
		let transaction = AutoBackup.db.transaction('projects', 'readonly');
		let store = transaction.objectStore('projects');
		return await new Promise(resolve => {
			let request = store.count();
			request.onsuccess = function() {
				resolve(!!request.result);
			}
			request.onerror = function(e) {
				console.error(e);
				resolve(false);
			}
		})
	},
	/**
	 * Recover all saved backups
	 */
	async recoverAllBackups(confirm_selection: boolean = false): Promise<void> {
		await AutoBackup.pruneExpired();
		return new Promise<void>((resolve, reject) => {
			let transaction = AutoBackup.db.transaction('projects', 'readonly');
			let store = transaction.objectStore('projects');
			let request = store.getAll();
			request.onsuccess = async function() {
				let projects = request.result as ProjectSave[];

				// Confirm selection
				if (confirm_selection && projects.length > 1) {
					let form: Record<string, FormElementOptions | '_'> = {
						info: {
							text: '自动备份保留三天。恢复后，请将项目保存为文件。',
							type: 'info'
						}
					};
					let keys: UUID[] = [];

					projects.sort((a, b) => (b.date??0) - (a.date??0));
					for (let project of projects) {
						let label = project.name ?? tl('message.recover_backup.unknown_project');
						let description: string;
						if (project.date) {
							let date = getDateDisplay(project.date * 1000);
							label += ` (${date.short})`;
							description = date.full;
						}
						form[project.uuid] = {
							label,
							description,
							type: 'checkbox',
							value: true
						}
						keys.push(project.uuid);
					}
					form.select_all_none = {
						type: 'buttons',
						buttons: ['generic.select_all', 'generic.select_none'],
						click(index) {
							let values = {};
							keys.forEach(key => values[key] = (index == 0));
							Dialog.open.setFormValues(values);
						}
					}
					form.delete_others = {
						type: 'checkbox',
						label: 'message.recover_backup.discard_others',
						value: false,
					}
					
					projects = await new Promise<ProjectSave[]>((resolve, reject) => {
						let dialog = new Dialog({
							id: 'recover_backup',
							title: 'message.recover_backup.title',
							form,
							onConfirm(form_result) {
								let to_open: ProjectSave[] = [];
								for (let project of projects) {
									if (form_result[project.uuid]) {
										to_open.push(project);
									} else if (form_result[project.uuid] == false && form_result.delete_others) {
										AutoBackup.removeBackup(project.uuid);
									}
								}
								resolve(to_open);
							}
						}).show();
						let content = dialog.object.querySelector('.dialog_content') as HTMLElement;
						if (content) {
							content.style.maxHeight = (window.innerHeight - 150) + 'px';
						}
					})
				}

				projects.sort((a, b) => (a.date??0) - (b.date??0));
				for (let project of projects) {
					try {
						let parsed_content = JSON.parse(project.data);
						setupProject(Formats[parsed_content.meta.model_format] || Formats.free, project.uuid);
						Codecs.project.parse(parsed_content, 'backup.bbmodel');
						Project.saved = false;
						await new Promise(r => setTimeout(r, 40));
					} catch(err) {
						console.error(err);
					}
				}
				resolve();
			}
			request.onerror = function(e) {
				console.error(e);
				reject(e);
			}
		})
	},
	async removeBackup(uuid: string) {
		let transaction = AutoBackup.db.transaction('projects', 'readwrite');
		let store = transaction.objectStore('projects');
		let request = store.delete(uuid);
		
		return await new Promise((resolve, reject) => {
			request.onsuccess = resolve;
			request.onerror = function(e) {
				reject();
			}
		});
	},
	async removeAllBackups() {
		let transaction = AutoBackup.db.transaction('projects', 'readwrite');
		let store = transaction.objectStore('projects');
		let request = store.clear();
		
		return await new Promise((resolve, reject) => {
			request.onsuccess = resolve;
			request.onerror = function(e) {
				console.error(e);
				reject();
			}
		});
	},
	backupProjectLoop(run_save: boolean = true) {
		if (run_save) {
			AutoBackup.pruneExpired().catch(console.error);
			AutoBackup.backupOpenProject().catch(console.error);
		}
		setTimeout(() => AutoBackup.backupProjectLoop(true), backupInterval);
	}
}
const global = {
	AutoBackup
};
declare global {
	const AutoBackup: typeof global.AutoBackup
}
Object.assign(window, global);
