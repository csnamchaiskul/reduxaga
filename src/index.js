import produce from "immer";
import { takeEvery as reduxTakeEvery } from "redux-saga/effects";
import { createSelector } from "reselect";

export const createActions = ({
  nameSpace,
  actions,
  initState,
  reduceFn,
  delimiter
}) => {
  delimiter =
    (delimiter && delimiter.trim() ? delimiter.trim() : undefined) || ":";

  if (!nameSpace || typeof nameSpace !== "string") throw "NameSpace is blank";

  //nameSpace = nameSpace.trim().toUpperCase();

  console.log("Create action generator: " + nameSpace);

  const actGens = Object.keys(actions)
    .map(k => Object.assign(actions[k], { subType: k }))
    .reduce(
      (acc, { subType, paramsFn, reduceFn, sagaFn, route }) =>
        Object.assign(acc, {
          [subType]: (() => {
            const gen = params => {
              const action = {
                type: gen.type,
                subType: gen.subType
              };

              //console.log(`this=${this.type}`);
              return paramsFn
                ? paramsFn({ action, params })
                : typeof params === "object"
                ? Object.assign(action, params)
                : action;
            };

            gen.nameSpace = nameSpace;
            gen.type = nameSpace + delimiter + subType;
            gen.reduceFn = convertReduceFn(subType, reduceFn);
            gen.sagaFn = sagaFn;
            gen.route = route;
            return gen;
          })()
        }),
      {}
    );

  actGens.reduceFns = Object.values(actGens).reduce(
    (acc, gen) =>
      gen && typeof gen.reduceFn === "function"
        ? Object.assign(acc, { [gen.type]: gen.reduceFn })
        : acc,
    {}
  );

  actGens.sagaFns = Object.values(actGens).reduce(
    (acc, gen) =>
      gen && typeof gen.sagaFn === "function"
        ? Object.assign(acc, { [gen.type]: gen.sagaFn })
        : acc,
    {}
  );

  actGens.takeEvery = () => doTakeEvery(actGens.sagaFns);

  actGens.nameSpace = nameSpace;
  actGens.initState = initState;
  actGens.reselector = createSelector(
    state => state[nameSpace],
    state => state
  );
  actGens.selector = (...selectors) => {
    if (selectors.length <= 0) return actGens.reselector;
    else if (selectors.length === 1)
      switch (typeof selectors[0]) {
        case "function":
          return createSelector(actGens.reselector, selectors[0]);

        case "string":
          return createSelector(
            actGens.reselector,
            state => state[selectors[0]]
          );
        default:
          throw "Error!";
      }
    else
      return createSelector(
        actGens.reselector,
        eval(
          "state=>" +
            selectors.reduce(
              (acc, i) =>
                (i && typeof i === "string" && acc + '["' + i + '"]') || acc,
              "state"
            )
        )
      );
  };

  actGens.reducer = produce((state, action) => {
    if (
      typeof action.type !== "string" ||
      action.type[actGens.nameSpace.length] !== delimiter ||
      action.type.substring(0, actGens.nameSpace.length) !== actGens.nameSpace
    )
      return state;

    const selectedReduceFn =
      typeof action.reduceFn === "function"
        ? action.reduceFn
        : typeof reduceFn === "function"
        ? reduceFn
        : actGens.reduceFns[action.type];

    return selectedReduceFn
      ? selectedReduceFn({ state, action, initState }) || state
      : state;
  }, actGens.initState);

  actGens.routerConfig = Object.values(actGens).reduce(
    (acc, gen) =>
      gen && typeof gen.route === "object" && gen.route["container"]
        ? Object.assign(acc, { [gen.type]: gen.route })
        : acc,
    {}
  );

  actGens.routesMap = Object.keys(actGens.routerConfig).reduce(
    (rootMap, i) =>
      actGens.routerConfig[i]["path"]
        ? Object.assign(rootMap, { [i]: actGens.routerConfig[i]["path"] })
        : rootMap,
    {}
  );

  actGens.getTargetContainer = type =>
    actGens.routerConfig
      ? actGens.routerConfig[type]
        ? actGens.routerConfig[type]["container"]
        : actGens.routerConfig[actGens.nameSpace + delimiter + "NOT_FOUND"]
        ? actGens.routerConfig[actGens.nameSpace + delimiter + "NOT_FOUND"][
            "container"
          ]
        : undefined
      : undefined;

  return actGens;
};

const convertReduceFn = (key, rawFn) => {
  switch (typeof rawFn) {
    case "function":
      return rawFn;

    case "string":
      if (rawFn.trim().startsWith("setAll")) {
        return ({ state, action }) =>
          Object.assign(
            state,
            stripObject(action, "type", "subType", "reduceFn", "paramFn")
          );
      } else if (rawFn.trim().startsWith("set")) {
        const valueKey =
          rawFn.split(" ")[1] || key.slice(3, 4).toLowerCase() + key.slice(4);
        //console.log(`valueKey=${valueKey}`);

        return ({ state, action }) => {
          state[valueKey] = action[valueKey];
        }; // Immer way
      }
      return undefined;

    default:
      return undefined;
  }
};

export const newObject = (...src) => Object.assign({}, ...src);

export const newImmerObject = produce((draft, ...src) =>
  Object.assign(draft, ...src)
);

export const stripObject = (obj, ...excludedProps) =>
  newObject(
    {},
    ...Object.keys(obj)
      .filter(p => !excludedProps.includes(p))
      .map(p => ({ [p]: obj[p] }))
  );

export const doTakeEvery = sagaFns =>
  Object.keys(sagaFns).map(key => reduxTakeEvery(key, sagaFns[key]));
