import { App, MarkdownView, Modal } from "obsidian";
import type Renderer from "../chartRenderer"
import type { ChartPluginSettings } from "../constants/settingsConstants";

interface SvelteRuntime {
	mount(component: unknown, options: { target: HTMLElement; props: Record<string, unknown> }): unknown;
	unmount(component: unknown): unknown;
}

interface HelperModalModule {
	default?: unknown;
}

export class CreationHelperModal extends Modal {
	view: MarkdownView;
	settings: ChartPluginSettings;
	renderer: Renderer;
	component: unknown = null;

	constructor(app: App, view: MarkdownView, settings: ChartPluginSettings, renderer: Renderer) {
		super(app);
		this.settings = settings;
		this.view = view;
		this.renderer = renderer;
	}

	onOpen() {
		const { contentEl, view, renderer} = this;
		contentEl.empty();
		const svelte = require("svelte") as SvelteRuntime;
		const loadedModal = require('./HelperModal.svelte') as unknown;
		const HelperModal = typeof loadedModal === 'object' && loadedModal !== null && 'default' in loadedModal
			? (loadedModal as HelperModalModule).default
			: loadedModal;
		this.component = svelte.mount(HelperModal, {
			target: contentEl,
			props: {
				editor: view.editor,
				renderer,
				onclose: () => this.close()
			}
		});
	}

	onClose() {
		if (this.component) {
			const svelte = require("svelte") as SvelteRuntime;
			svelte.unmount(this.component);
			this.component = null;
		}
		const { contentEl } = this;
		contentEl.empty();
	}
}
