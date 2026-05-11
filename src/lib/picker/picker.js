// Browser-side SiLA picker widget. Loaded once via the sila-connection
// editor HTML; exposes window.SilaPicker.attach({ ... }) for action nodes.
//
// Two modes (set via opts.kind):
//   "command"  — pick a SiLA command (for sila-call-command)
//   "property" — pick a SiLA property (for sila-get-property)
//
// Cascade: connection -> feature -> command/property leaf
//
// Backed by GET /sila/conn/:id/features which returns the introspected
// list of loaded features and their methods classified by name pattern.
(function () {
  if (window.SilaPicker) return; // idempotent

  const $ = window.jQuery || window.$;

  // jQuery rather than fetch so the editor's adminAuth bearer token is
  // attached automatically by Node-RED's beforeSend hook.
  function fetchJSON(url) {
    return new Promise((resolve, reject) => {
      $.ajax({ url: url, dataType: "json", method: "GET" })
        .done(resolve)
        .fail(function (xhr) {
          let body = {};
          try { body = JSON.parse(xhr.responseText || "{}"); } catch (_) { /* ignore */ }
          const err = new Error(body.error || ("HTTP " + xhr.status));
          err.status = xhr.status;
          err.body = body;
          reject(err);
        });
    });
  }

  function fillSelect($sel, items, opts) {
    const { valueKey, labelFn, placeholder } = opts;
    $sel.empty();
    if (placeholder) {
      $sel.append($("<option>").val("").text(placeholder));
    }
    for (const it of items || []) {
      const v = valueKey ? it[valueKey] : "";
      $sel.append($("<option>").val(v).text(labelFn(it)));
    }
  }

  function attach(opts) {
    const kind = opts.kind || "command"; // "command" | "property"
    const $form = $(opts.formSelector || "form.dialog-form, .red-ui-editor-form");
    const $conn = $("#" + (opts.connectionFieldId || "node-input-connection"));
    const $feature = $("#" + (opts.featureFieldId || "node-input-feature"));
    const $methodOut = $("#" + opts.methodFieldId);
    const $container = $methodOut.closest(".form-row");

    // Idempotent: rebuild on each attach call (Node-RED reuses the
    // dialog DOM across edits of different nodes).
    $form.find(".sila-picker-rows").remove();

    const leafLabel = (kind === "command") ? "Command" : "Property";
    const leafIcon = (kind === "command") ? "fa-bolt" : "fa-eye";

    const $rows = $(`
      <div class="sila-picker-rows" style="border:1px dashed #d8d8d8;padding:10px;margin-bottom:8px;border-radius:4px;background:#fafafa">
        <div class="sila-pick-header" style="font-size:11px;color:#888;margin-bottom:6px;">
          <i class="fa fa-sitemap"></i> Browse loaded features (or type below for manual entry)
        </div>
        <div class="sila-pick-info" style="display:none;padding:8px;font-size:12px;border-radius:3px;margin-bottom:4px;"></div>
        <div class="form-row" style="margin-bottom:6px">
          <label><i class="fa fa-cube"></i> Feature</label>
          <select class="sila-pick-feature" style="width:70%"></select>
        </div>
        <div class="form-row" style="margin-bottom:6px">
          <label><i class="fa ${leafIcon}"></i> ${leafLabel}</label>
          <select class="sila-pick-method" style="width:70%"></select>
        </div>
      </div>
    `);
    $container.before($rows);

    const $featureSel = $rows.find(".sila-pick-feature");
    const $methodSel = $rows.find(".sila-pick-method");
    const $info = $rows.find(".sila-pick-info");

    let cachedFeatures = [];

    function showInfo(msg, color) {
      $info.text(msg)
        .css("background", color || "#fff3cd")
        .css("color", color === "#f8d7da" ? "#721c24" : "#856404")
        .show();
    }
    function clearInfo() { $info.hide(); }

    async function loadFeatures() {
      const connId = $conn.val();
      if (!connId) {
        showInfo("Pick a connection first.");
        fillSelect($featureSel, [], { placeholder: "—" });
        fillSelect($methodSel, [], { placeholder: "—" });
        return;
      }
      try {
        const data = await fetchJSON("sila/conn/" + encodeURIComponent(connId) + "/features");
        cachedFeatures = data.features || [];
        clearInfo();
        // Show only features that have at least one method of our kind.
        const visibleFeatures = cachedFeatures.filter(
          (f) => f.methods.some((m) => m.kind === kind),
        );
        fillSelect($featureSel, visibleFeatures, {
          valueKey: "shortName",
          labelFn: (f) => f.shortName,
          placeholder: visibleFeatures.length
            ? "— pick a feature —"
            : `(no features with ${kind}s loaded)`,
        });
        // Preselect from existing manual value if it matches a loaded feature.
        const cur = $feature.val();
        if (cur && visibleFeatures.some((f) => f.shortName === cur)) {
          $featureSel.val(cur);
        }
        renderMethods();
      } catch (err) {
        if (err.status === 404) {
          showInfo("Connection not deployed yet — deploy first to enable picker.");
        } else {
          showInfo("Picker error: " + err.message, "#f8d7da");
        }
      }
    }

    function renderMethods() {
      const featName = $featureSel.val();
      const feat = cachedFeatures.find((f) => f.shortName === featName);
      if (!feat) {
        fillSelect($methodSel, [], { placeholder: "—" });
        return;
      }
      const filtered = feat.methods.filter((m) => m.kind === kind);
      fillSelect($methodSel, filtered, {
        valueKey: kind === "command" ? "name" : "propertyName",
        labelFn: (m) => kind === "command" ? m.name : m.propertyName,
        placeholder: filtered.length ? `— pick a ${kind} —` : `(no ${kind}s on this feature)`,
      });
      // Preselect from existing manual value if it matches.
      const curMethod = $methodOut.val();
      if (curMethod) {
        const opt = filtered.find((m) =>
          (kind === "command" ? m.name : m.propertyName) === curMethod,
        );
        if (opt) $methodSel.val(curMethod);
      }
    }

    // Wire interactions:
    //  - Feature change → write to manual feature field, refresh method list,
    //    clear method (user must re-pick to avoid silently keeping a stale value).
    //  - Method change → write to manual method field.
    //  - Connection change → refresh everything from scratch.
    $featureSel.on("change", function () {
      const v = $featureSel.val();
      $feature.val(v);
      $methodOut.val("");
      renderMethods();
    });
    $methodSel.on("change", function () {
      $methodOut.val($methodSel.val());
    });
    $conn.on("change", loadFeatures);

    loadFeatures();
  }

  window.SilaPicker = { attach };
})();
