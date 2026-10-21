const COLORS = [
	"B0D2FF", "9CBEE9", "88ABD3", "7497BD", "6084A7", "4C7191", "395E7C", "244B67",
	"FFF90D", "ECE20B", "D9CB0A", "C6B408", "B49D07", "A18605", "8E6F04", "7B5803",
	"01DD01", "FF211D", "FFFF53", "FF017F", "0101FF", "7F9BF1", "C1B1D1", "57656F",
	"4D4D4D", "E3E3FF", "DFDFDF", "C9C9C9", "B3B3B3", "9B9B9B", "6B6B6B", "E7FFFF"
];
const NIGHT_COLORS = new Map([
	["01DD01", "01DD01"], ["FF211D", "FF211D"], ["FFFF53", "FFFF53"], ["0101FF", "0101FF"],
	["7F9BF1", "80C3D3"], ["C1B1D1", "D3C380"], ["57656F", "D3C380"], ["4D4D4D", "D3C380"],
	["E3E3FF", "FFFFE3"], ["DFDFDF", "DFDFDF"], ["C9C9C9", "C9C9C9"], ["B3B3B3", "B3B3B3"],
	["9B9B9B", "9B9B9B"], ["6B6B6B", "6B6B6B"]
].map(([from, to]) => [parseInt(from, 16), parseInt(to, 16)]));
const TRANSPARENT_COLOR = parseInt("E7FFFF", 16);
const OVERLAY_ALPHA = 0xBD / 255;
const fileInput = document.querySelector("#file-input");
const openButton = document.querySelector("#open-image");
const exportButton = document.querySelector("#export-image");
const highlightToggle = document.querySelector("#highlight-toggle");
const transparentToggle = document.querySelector("#transparent-toggle");
const nightToggle = document.querySelector("#night-toggle");
const swatches = document.querySelector("#swatches");
const activeCount = document.querySelector("#active-count");
const dropZone = document.querySelector("#drop-zone");
const canvas = document.querySelector("#canvas");
const context = canvas.getContext("2d", { willReadFrequently: true });
const emptyState = document.querySelector("#empty-state");
const imageInfo = document.querySelector("#image-info");
let sourceImage = null;
let sourcePixels = null;
let originalFileName = 'image.png';
const enabledColors = new Set();

for (const color of COLORS) {
	const label = document.createElement("label");
	label.className = "swatch";
	label.innerHTML = '<input type="checkbox" value="' + color + '" aria-label="' + color + 'を置換"><span class="color-chip" style="background:#' + color + '"></span><span class="color-code">#' + color + '</span>';
	label.querySelector("input").addEventListener("change", (event) => {
		if (event.target.checked) enabledColors.add(color);
		else enabledColors.delete(color);
		render();
	});
	swatches.append(label);
}
openButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
	const file = fileInput.files && fileInput.files[0];
	if (file) loadFile(file);
	fileInput.value = "";
});
highlightToggle.addEventListener("change", render);
transparentToggle.addEventListener("change", render);
nightToggle.addEventListener("change", render);
exportButton.addEventListener("click", exportImage);
dropZone.addEventListener("dragover", (event) => {
	event.preventDefault();
	dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", (event) => {
	if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove("dragging");
});
dropZone.addEventListener("drop", (event) => {
	event.preventDefault();
	dropZone.classList.remove("dragging");
	const file = Array.from((event.dataTransfer && event.dataTransfer.files) || []).find((item) => item.type.startsWith("image/"));
	if (file) loadFile(file);
});

function loadFile(file) {
	if (!file.type.startsWith("image/")) return;
	originalFileName = file.name;
	const url = URL.createObjectURL(file);
	const image = new Image();
	image.onload = () => {
		sourceImage = image;
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		context.drawImage(image, 0, 0);
		sourcePixels = context.getImageData(0, 0, canvas.width, canvas.height);
		emptyState.hidden = true;
		canvas.hidden = false;
		imageInfo.hidden = false;
		imageInfo.textContent = canvas.width + " × " + canvas.height;
		exportButton.disabled = false;
		URL.revokeObjectURL(url);
		render();
	};
	image.onerror = () => URL.revokeObjectURL(url);
	image.src = url;
}

function makeReplacementMap() {
	return new Map(Array.from(enabledColors, (color) => [
		parseInt(color, 16),
		[0, 2, 4].map((offset) => parseInt(color.slice(offset, offset + 2), 16) - 1)
	]));
}

function transformPixels(includeNightMode, includeTransparency, includeHighlight) {
	const output = new ImageData(new Uint8ClampedArray(sourcePixels.data), sourcePixels.width, sourcePixels.height);
	const pixels = output.data;
	const replacements = makeReplacementMap();
	const highlightColors = new Set(Array.from(enabledColors, (color) => parseInt(color, 16)));
	for (let i = 0; i < pixels.length; i += 4) {
		const sourceKey = (sourcePixels.data[i] << 16) | (sourcePixels.data[i + 1] << 8) | sourcePixels.data[i + 2];
		const replacement = replacements.get(sourceKey);
		if (replacement) {
			pixels[i] = replacement[0];
			pixels[i + 1] = replacement[1];
			pixels[i + 2] = replacement[2];
		}

		if (includeNightMode) {
			const key = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
			const nightColor = NIGHT_COLORS.get(key);
			if (nightColor !== undefined) {
				pixels[i] = (nightColor >> 16) & 255;
				pixels[i + 1] = (nightColor >> 8) & 255;
				pixels[i + 2] = nightColor & 255;
			} else {
				const alpha = pixels[i + 3] / 255;
				const outAlpha = OVERLAY_ALPHA + alpha * (1 - OVERLAY_ALPHA);
				const scale = outAlpha ? alpha * (1 - OVERLAY_ALPHA) / outAlpha : 0;
				pixels[i] = Math.round(pixels[i] * scale);
				pixels[i + 1] = Math.round(pixels[i + 1] * scale);
				pixels[i + 2] = Math.round(pixels[i + 2] * scale);
				pixels[i + 3] = Math.round(outAlpha * 255);
			}
		}

		if (includeTransparency && sourceKey === TRANSPARENT_COLOR) {
			pixels[i] = 0;
			pixels[i + 1] = 0;
			pixels[i + 2] = 0;
			pixels[i + 3] = 0;
		}
		if (includeHighlight && highlightColors.has(sourceKey)) {
			pixels[i] = 255;
			pixels[i + 1] = 0;
			pixels[i + 2] = 255;
			pixels[i + 3] = sourcePixels.data[i + 3];
		}
	}
	return output;
}

function render() {
	activeCount.textContent = enabledColors.size + " 色選択中";
	if (!sourceImage || !sourcePixels) return;
	context.putImageData(transformPixels(nightToggle.checked, transparentToggle.checked, highlightToggle.checked), 0, 0);
}

function exportImage() {
	if (!sourceImage) return;
	const outputCanvas = document.createElement("canvas");
	outputCanvas.width = sourcePixels.width;
	outputCanvas.height = sourcePixels.height;
	outputCanvas.getContext("2d").putImageData(transformPixels(false, transparentToggle.checked, false), 0, 0);
	outputCanvas.toBlob((blob) => {
		if (!blob) return;
		const lastDotIndex = originalFileName.lastIndexOf('.');
		let newFileName = '';
		if (lastDotIndex !== -1) {
			const baseName = originalFileName.substring(0, lastDotIndex);
			const extension = originalFileName.substring(lastDotIndex);
			newFileName = `${baseName}_color-replaced${extension}`;
		} else {
			newFileName = `${originalFileName}_color-replaced`;
		}
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = newFileName;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}, "image/png");
}
