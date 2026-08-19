// Supabase-backed localStorage sync for the BeeOne Event app.
(function () {
  if (!window.fetch || !window.localStorage) return;

  function startSync() {
    if (window._supabaseSyncStarted) return;
    window._supabaseSyncStarted = true;

    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY ||
        window.SUPABASE_URL.indexOf('YOUR_') === 0 ||
        window.SUPABASE_ANON_KEY.indexOf('YOUR_') === 0) {
      console.error('Supabase is not configured. Edit js/supabase-config.js with your Project URL and Publishable/Anon key.');
      window._localstorageHydrated = true;
      window.dispatchEvent(new CustomEvent('localstorage-hydrated'));
      return;
    }

    var client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    window.eventalkSupabase = client;
    var originalSet = Storage.prototype.setItem;
    var originalRemove = Storage.prototype.removeItem;
    var timers = {};

    function parse(value) {
      try { return JSON.parse(value); } catch (e) { return { __raw: String(value) }; }
    }

    function hydrate() {
      client.from('eventalk_content').select('key,data').then(function (result) {
        if (result.error) throw result.error;
        (result.data || []).forEach(function (row) {
          // Do not overwrite data already entered in this browser.
          if (localStorage.getItem(row.key) === null) {
            originalSet.call(localStorage, row.key, JSON.stringify(row.data));
          }
        });
        window._localstorageHydrated = true;
        window.dispatchEvent(new CustomEvent('localstorage-hydrated'));
      }).catch(function (err) {
        console.error('Supabase load failed:', err);
        window._localstorageHydrated = true;
        window.dispatchEvent(new CustomEvent('localstorage-hydrated'));
      });
    }

    function save(key, value) {
      clearTimeout(timers[key]);
      timers[key] = setTimeout(function () {
        client.from('eventalk_content').upsert({
          key: key,
          data: parse(value),
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' }).then(function (result) {
          if (result.error) {
            console.error('Supabase save failed for ' + key + ':', result.error);
            window.dispatchEvent(new CustomEvent('supabase-save-error', { detail: result.error }));
          } else {
            console.log('Supabase saved:', key);
            window.dispatchEvent(new CustomEvent('supabase-saved', { detail: { key: key } }));
          }
        });
      }, 150);
    }

    Storage.prototype.setItem = function (key, value) {
      originalSet.call(this, key, value);
      if (String(key).indexOf('eventalk_') === 0) save(String(key), value);
    };

    Storage.prototype.removeItem = function (key) {
      originalRemove.call(this, key);
      if (String(key).indexOf('eventalk_') !== 0) return;
      client.from('eventalk_content').delete().eq('key', key).then(function (result) {
        if (result.error) console.error('Supabase delete failed for ' + key + ':', result.error);
      });
    };

    hydrate();
  }

  // This file is loaded after the Supabase CDN and config in the converted pages.
  if (window.supabase) startSync();
  else window.addEventListener('supabase-ready', startSync, { once: true });
})();
