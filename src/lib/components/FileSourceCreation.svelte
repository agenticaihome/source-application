<script lang="ts">
    import { addFileSource } from "$lib/ergo/sourceStore";
    import { type SourceEntry } from "$lib/ergo/sourceObject";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Label } from "$lib/components/ui/label/index.js";
    import { Textarea } from "$lib/components/ui/textarea";
    import { AlertTriangle, Download, Upload, Loader2, Plus, Trash2 } from "lucide-svelte";
    import { type ReputationProof } from "$lib/ergo/object";
    import { blake2b256 } from "@fleet-sdk/crypto";
    import { uint8ArrayToHex } from "$lib/ergo/utils";
    import { type Writable } from "svelte/store";

    // Props for island mode
    export let profile: ReputationProof | null = null;
    export let explorerUri: string;
    export let source_explorer_url: string;
    export let onSourceAdded: ((txId: string) => void) | null = null;
    export let hash: Writable<string> | undefined = undefined;

    export let title: string = "Add New File Source";
    let className: string = "";
    export { className as class };

    const hasProfile = profile !== null;
    const baseClasses = "bg-card p-6 rounded-lg border";

    let newFileHash = "";
    let hashFunctionId = "";
    let isAddingSource = false;
    let addError: string | null = null;

    let isCalculatingHash = false;
    let hashError: string | null = null;
    let urlMismatch = false;

    // Source entries array
    interface SourceEntryForm {
        hashFunctionId: string;
        contentFormatNftId: string;
        contentHash: string;
        rawFormatNftId: string;
        urlLink: string;
    }

    let sourceEntries: SourceEntryForm[] = [
        { hashFunctionId: "", contentFormatNftId: "", contentHash: "", rawFormatNftId: "", urlLink: "" }
    ];

    function addSourceEntry() {
        sourceEntries = [
            ...sourceEntries,
            { hashFunctionId: "", contentFormatNftId: "", contentHash: "", rawFormatNftId: "", urlLink: "" }
        ];
    }

    function removeSourceEntry(index: number) {
        if (sourceEntries.length <= 1) return;
        sourceEntries = sourceEntries.filter((_, i) => i !== index);
    }

    // Reactive value for the current hash from the store
    $: currentHashValue = (hash ? $hash : "") || "";
    $: isHashFixed = currentHashValue !== "";

    // Sync newFileHash with store
    $: if (hash && $hash) {
        newFileHash = $hash;
    }

    // Check if at least one source entry has a URL
    $: hasValidEntry = sourceEntries.some(e => e.urlLink.trim() !== "");

    function updateHash(val: string) {
        newFileHash = val;
        if (hash) {
            hash.set(val);
        }
    }

    async function calculateHashFromUrl() {
        const firstUrl = sourceEntries[0]?.urlLink?.trim();
        if (!firstUrl) return;

        isCalculatingHash = true;
        hashError = null;
        urlMismatch = false;
        try {
            const response = await fetch(firstUrl);
            if (!response.ok)
                throw new Error(`Failed to fetch file: ${response.statusText}`);
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const hashResult = uint8ArrayToHex(blake2b256(bytes));

            if (isHashFixed && hashResult !== currentHashValue) {
                urlMismatch = true;
                hashError = `Calculated hash (${hashResult}) does not match the expected hash (${currentHashValue})`;
            } else {
                updateHash(hashResult);
            }
        } catch (err: any) {
            console.error("Error calculating hash from URL:", err);
            hashError = err?.message || "Failed to calculate hash from URL";
        } finally {
            isCalculatingHash = false;
        }
    }

    async function handleFileUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const file = input.files[0];
        isCalculatingHash = true;
        hashError = null;
        try {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const hashResult = blake2b256(bytes);
            updateHash(uint8ArrayToHex(hashResult));
        } catch (err: any) {
            console.error("Error calculating hash from file:", err);
            hashError = err?.message || "Failed to calculate hash from file";
        } finally {
            isCalculatingHash = false;
            input.value = ""; // Reset input
        }
    }

    async function handleAddSource() {
        if (!hasValidEntry || !profile) return;

        // If hash is fixed but not yet validated (or mismatch), we should validate it now
        if (isHashFixed && !urlMismatch && newFileHash !== currentHashValue) {
            newFileHash = currentHashValue;
        }

        // If it's fixed, we MUST validate the URL content before adding
        if (isHashFixed && sourceEntries[0]?.urlLink?.trim()) {
            isCalculatingHash = true;
            hashError = null;
            try {
                const response = await fetch(sourceEntries[0].urlLink.trim());
                if (!response.ok)
                    throw new Error(
                        `Failed to fetch file: ${response.statusText}`,
                    );
                const buffer = await response.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const hashResult = uint8ArrayToHex(blake2b256(bytes));

                if (hashResult !== currentHashValue) {
                    urlMismatch = true;
                    hashError = `Calculated hash (${hashResult}) does not match the expected hash (${currentHashValue})`;
                    isCalculatingHash = false;
                    return;
                }
            } catch (err: any) {
                console.error("Error validating URL:", err);
                hashError = err?.message || "Failed to validate URL";
                isCalculatingHash = false;
                return;
            } finally {
                isCalculatingHash = false;
            }
        }

        if (!newFileHash.trim() || urlMismatch) return;

        isAddingSource = true;
        addError = null;
        try {
            // Build SourceEntry array from form
            const entries: SourceEntry[] = sourceEntries
                .filter(e => e.urlLink.trim() !== "")
                .map(e => ({
                    hashFunctionId: e.hashFunctionId.trim(),
                    contentFormatNftId: e.contentFormatNftId.trim(),
                    contentHash: e.contentHash.trim(),
                    rawFormatNftId: e.rawFormatNftId.trim(),
                    urlLink: e.urlLink.trim()
                }));

            const tx = await addFileSource(
                newFileHash.trim(),
                hashFunctionId.trim(),
                entries,
                profile,
                explorerUri,
            );
            console.log("Source added, tx:", tx);
            if (!isHashFixed) {
                updateHash("");
            }
            hashFunctionId = "";
            sourceEntries = [
                { hashFunctionId: "", contentFormatNftId: "", contentHash: "", rawFormatNftId: "", urlLink: "" }
            ];

            if (onSourceAdded) {
                onSourceAdded(tx);
            }
        } catch (err: any) {
            console.error("Error adding source:", err);
            addError = err?.message || "Failed to add source";
        } finally {
            isAddingSource = false;
        }
    }
</script>

<div class="{baseClasses} {className}">
    <h3 class="text-xl font-semibold mb-1">{title}</h3>
    <div class="mb-4">
        {#if newFileHash}
            <div class="text-xs font-mono text-muted-foreground break-all">
                <span class="font-semibold text-primary/70">Hash:</span>
                <a
                    href={`${source_explorer_url}?search=${newFileHash}`}
                    target="_blank"
                    class="hover:underline text-primary"
                >
                    {newFileHash}
                </a>
            </div>
        {:else}
            <div class="text-xs text-muted-foreground italic">
                No hash selected
            </div>
        {/if}
    </div>

    <div
        class="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg mb-4 flex gap-2"
    >
        <AlertTriangle class="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div class="text-sm text-amber-200">
            <strong>Security Warning:</strong> Always verify URLs before downloading.
            Malicious actors may post harmful links. The URL you provide will be
            publicly visible and immutable on the blockchain.
        </div>
    </div>

    {#if addError || hashError}
        <div class="bg-red-500/10 border border-red-500/20 p-3 rounded-lg mb-4">
            <p class="text-sm text-red-200 break-all">
                {addError || hashError}
            </p>
        </div>
    {/if}

    <div class="space-y-4">
        {#if !isHashFixed}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <Label for="file-hash">Raw File Hash (R5 Anchor)</Label>
                    <Input
                        type="text"
                        id="file-hash"
                        value={newFileHash}
                        on:input={(e) => updateHash(e.currentTarget.value)}
                        placeholder="64-character hexadecimal hash"
                        class="font-mono text-sm"
                        disabled={!hasProfile || isCalculatingHash}
                    />
                    <p class="text-xs text-muted-foreground mt-1">
                        The raw file hash digest. Users search by this.
                    </p>
                </div>

                <div>
                    <Label>Upload File to Hash</Label>
                    <div class="relative">
                        <input
                            type="file"
                            id="file-upload"
                            class="hidden"
                            on:change={handleFileUpload}
                            disabled={!hasProfile || isCalculatingHash}
                        />
                        <Button
                            variant="outline"
                            class="w-full"
                            on:click={() =>
                                document.getElementById("file-upload")?.click()}
                            disabled={!hasProfile || isCalculatingHash}
                        >
                            {#if isCalculatingHash}
                                <Loader2 class="w-4 h-4 mr-2 animate-spin" />
                                Calculating...
                            {:else}
                                <Upload class="w-4 h-4 mr-2" />
                                Select File
                            {/if}
                        </Button>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1">
                        Calculate hash from a local file.
                    </p>
                </div>
            </div>
        {/if}

        <div>
            <Label for="hash-function-id">Hash Function ID</Label>
            <Input
                type="text"
                id="hash-function-id"
                bind:value={hashFunctionId}
                placeholder="HASH(EMPTY_INPUT) identifier"
                class="font-mono text-sm"
                disabled={!hasProfile || isCalculatingHash}
            />
            <p class="text-xs text-muted-foreground mt-1">
                Identifies the hash algorithm used. Per convention: output of HASH(EMPTY_INPUT).
            </p>
        </div>

        <!-- Source Entries -->
        <div class="space-y-4">
            <div class="flex items-center justify-between">
                <Label class="text-base font-semibold">Source Entries</Label>
                <Button
                    variant="outline"
                    size="sm"
                    on:click={addSourceEntry}
                    disabled={!hasProfile}
                    class="text-xs"
                >
                    <Plus class="w-3 h-3 mr-1" />
                    Add Entry
                </Button>
            </div>

            {#each sourceEntries as entry, i}
                <div class="border rounded-lg p-4 space-y-3 relative bg-background/50">
                    {#if sourceEntries.length > 1}
                        <button
                            on:click={() => removeSourceEntry(i)}
                            class="absolute top-2 right-2 p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                            title="Remove this entry"
                        >
                            <Trash2 class="w-4 h-4" />
                        </button>
                    {/if}

                    <div class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Source Entry {i + 1}
                    </div>

                    <div>
                        <Label for="url-{i}">URL / Download Link</Label>
                        <div class="flex gap-2">
                            <Textarea
                                id="url-{i}"
                                bind:value={entry.urlLink}
                                placeholder="https://example.com/file.zip or ipfs://... or magnet:..."
                                rows={2}
                                class="font-mono text-sm"
                                disabled={!hasProfile || isCalculatingHash}
                            />
                            {#if i === 0 && !isHashFixed}
                                <Button
                                    variant="outline"
                                    size="icon"
                                    class="flex-shrink-0 h-auto"
                                    on:click={calculateHashFromUrl}
                                    disabled={!hasProfile ||
                                        isCalculatingHash ||
                                        !entry.urlLink.trim()}
                                    title="Calculate hash from URL"
                                >
                                    {#if isCalculatingHash}
                                        <Loader2 class="w-4 h-4 animate-spin" />
                                    {:else}
                                        <Download class="w-4 h-4" />
                                    {/if}
                                </Button>
                            {/if}
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <Label for="entry-hash-fn-{i}">Hash Function ID</Label>
                            <Input
                                type="text"
                                id="entry-hash-fn-{i}"
                                bind:value={entry.hashFunctionId}
                                placeholder="Hash function identifier"
                                class="font-mono text-xs"
                                disabled={!hasProfile}
                            />
                        </div>
                        <div>
                            <Label for="content-hash-{i}">Content Hash</Label>
                            <Input
                                type="text"
                                id="content-hash-{i}"
                                bind:value={entry.contentHash}
                                placeholder="Hash of content at this URL"
                                class="font-mono text-xs"
                                disabled={!hasProfile}
                            />
                        </div>
                        <div>
                            <Label for="content-format-{i}">Content Format NFT ID</Label>
                            <Input
                                type="text"
                                id="content-format-{i}"
                                bind:value={entry.contentFormatNftId}
                                placeholder="NFT ID for content file format"
                                class="font-mono text-xs"
                                disabled={!hasProfile}
                            />
                        </div>
                        <div>
                            <Label for="raw-format-{i}">Raw Format NFT ID</Label>
                            <Input
                                type="text"
                                id="raw-format-{i}"
                                bind:value={entry.rawFormatNftId}
                                placeholder="NFT ID for raw (uncompressed) format"
                                class="font-mono text-xs"
                                disabled={!hasProfile}
                            />
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        <Button
            on:click={handleAddSource}
            disabled={isAddingSource ||
                isCalculatingHash ||
                !hasProfile ||
                !newFileHash.trim() ||
                !hasValidEntry}
            class="w-full"
        >
            {#if isAddingSource}
                <Loader2 class="w-4 h-4 mr-2 animate-spin inline" />
                Adding Source...
            {:else if isCalculatingHash}
                <Loader2 class="w-4 h-4 mr-2 animate-spin inline" />
                Validating URL...
            {:else}
                Add Source
            {/if}
        </Button>
    </div>
</div>
