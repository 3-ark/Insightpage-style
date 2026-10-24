import { App, MarkdownView, Modal } from "obsidian";
import type Renderer from "../chartRenderer"
import type { ChartPluginSettings } from "../constants/settingsConstants";

export class CreationHelperModal extends Modal {
	view: MarkdownView;
	settings: ChartPluginSettings;
	renderer: Renderer;
	component: any = null;

	constructor(app: App, view: MarkdownView, settings: ChartPluginSettings, renderer: Renderer) {
		super(app);
		this.settings = settings;
		this.view = view;
		this.renderer = renderer;
	}

	onOpen() {
		let { contentEl, view, renderer} = this;
		contentEl.empty();
		const { mount } = require("svelte");
		const HelperModal = require('./HelperModal.svelte').default ?? require('./HelperModal.svelte');
		this.component = mount(HelperModal, {
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
			const { unmount } = require("svelte");
			unmount(this.component);
			this.component = null;
		}
		let { contentEl } = this;
		contentEl.empty();
	}
}
