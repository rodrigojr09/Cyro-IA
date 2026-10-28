// A successful revalidation of the same session must not reset a loaded workspace.
function createReadiness({ authenticated = false, changed = () => {} } = {}) {
  let active = authenticated,
    generation = 0,
    bootstrap = 0,
    complete = false,
    loaded = false;
  const update = (value) => {
    if (loaded !== value) {
      loaded = value;
      changed(value);
    }
  };
  return {
    ready: () => active && loaded,
    capture: () => generation,
    current: (value) => value === generation,
    transition(value) {
      value = !!value;
      if (active === value) return false;
      active = value;
      generation++;
      bootstrap++;
      complete = false;
      update(false);
      return true;
    },
    begin() {
      complete = false;
      update(false);
      return { generation, bootstrap: ++bootstrap };
    },
    finish(token, success) {
      if (!active || token.generation !== generation || token.bootstrap !== bootstrap) return false;
      complete = success === true;
      return complete;
    },
    acknowledge() {
      if (!active || !complete)
        throw Error('Aguarde o carregamento das suas informações e histórico.');
      update(true);
      return true;
    },
  };
}
module.exports = { createReadiness };
