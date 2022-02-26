
angular.module('layout', ['idePerspective', 'ideMessageHub'])
    .constant('SplitPaneState', {
        EXPANDED: 0,
        COLLAPSED: 1
    })
    .factory('Views', ['$resource', function ($resource) {
        let get = function () {
            return $resource('/services/v4/js/ide-core/services/views.js').query().$promise
                .then(function (data) {
                    data = data.map(function (v) {
                        v.id = v.id || v.name.toLowerCase();
                        v.label = v.label || v.name;
                        v.factory = v.factory || 'frame';
                        v.settings = {
                            "path": v.link
                        }
                        v.region = v.region || 'left-top';
                        return v;
                    });
                    //no extension point. provisioned "manually"
                    //data.push({ "id": "editor", "factory": "editor", "region": "center-middle", "label": "Editor", "settings": {} });
                    let brandingInfo = getBrandingInfo();
                    data.push({ "id": "welcome", "factory": "frame", "region": "center-middle", "label": "Welcome", "settings": { "path": brandingInfo.welcomePage } });
                    //no extension point yet
                    data.push({ "id": "result", "factory": "frame", "region": "center-bottom", "label": "Result", "settings": { "path": "../ide-database/sql/result.html" } });
                    data.push({ "id": "properties", "factory": "frame", "region": "center-bottom", "label": "Properties", "settings": { "path": "../ide/properties.html" } });
                    data.push({ "id": "sql", "factory": "frame", "region": "center-middle", "label": "SQL", "settings": { "path": "../ide-database/sql/editor.html" } });

                    return data;
                });
        };

        return {
            get: get
        };
    }])
    .directive('view', ['Views', function (Views) {
        return {
            restrict: 'E',
            replace: true,
            scope: {
                name: '@',
                settings: '=',
            },
            link: function (scope, element, attrs) {
                Views.get().then(function (views) {
                    const view = views.find(v => v.id === scope.name);
                    if (view)
                        scope.path = view.settings.path;
                });
            },
            templateUrl: 'ide-layout/view.html'
        }
    }])
    .directive('ideLayout', ['Views', 'Layouts', 'Editors', 'SplitPaneState', 'messageHub', '$timeout', function (Views, Layouts, Editors, SplitPaneState, messageHub, $timeout) {
        return {
            restrict: 'E',
            replace: true,
            scope: {
                id: '@',
                viewsLayoutModel: '='
            },
            controller: ['$scope', function ($scope) {
                const VIEW = 'view';
                const EDITOR = 'editor';

                $scope.views = [];
                $scope.explorerTabs = [];
                $scope.bottomTabs = [];
                $scope.centerSplittedTabViews = {
                    direction: 'horizontal',
                    panes: [
                        {
                            tabs: [],
                            selectedTab: null
                        }
                    ]
                };

                $scope.layoutSettings = $scope.viewsLayoutModel.layoutSettings || {};
                $scope.selection = {
                    selectedBottomTab: null
                };
                $scope.splitPanesState = {
                    main: []
                }

                $scope.initialOpenViews = $scope.viewsLayoutModel.views;

                let eventHandlers = $scope.viewsLayoutModel.events;
                //let viewSettings = $scope.viewsLayoutModel.viewSettings;

                Views.get().then(function (views) {
                    $scope.views = views;

                    const viewExists = (v) => views.some(x => x.id === v.id);
                    const viewById = (viewId) => $scope.views.find(v => v.id === viewId);
                    const byLeftRegion = view => view.region.startsWith('left')
                    const byBottomRegion = view => view.region === 'center-bottom';
                    const byCenterRegion = view => view.region === 'center-top' || view.region === 'center-middle';

                    const savedState = loadLayoutState();
                    if (savedState) {
                        const restoreCenterSplittedTabViews = function (state, removedViewsIds) {
                            if (state.panes) {
                                state.panes.forEach(pane => restoreCenterSplittedTabViews(pane, removedViewsIds));
                            } else {
                                state.tabs = state.tabs.filter(v => v.type === EDITOR || (viewExists(v) && (!removedViewsIds || !removedViewsIds.includes(v.id))));
                                if (!state.tabs.some(x => x.id === state.selectedTab)) {
                                    state.selectedTab = null;
                                }
                            }

                            return state;
                        }

                        $scope.explorerTabs = savedState.explorer.tabs.filter(viewExists);
                        $scope.bottomTabs = savedState.bottom.tabs.filter(viewExists);

                        let newlyAddedViews, removedViewsIds;
                        let initialOpenViewsChanged = !angular.equals(savedState.initialOpenViews, $scope.initialOpenViews);
                        if (initialOpenViewsChanged) {
                            newlyAddedViews = $scope.initialOpenViews.filter(x => savedState.initialOpenViews.every(y => x !== y)).map(viewById);
                            removedViewsIds = savedState.initialOpenViews.filter(x => $scope.initialOpenViews.every(y => x !== y));

                            $scope.explorerTabs = $scope.explorerTabs
                                .filter(x => !removedViewsIds.includes(x.id))
                                .concat(newlyAddedViews.filter(byLeftRegion).map(mapViewToTab));

                            $scope.bottomTabs = $scope.bottomTabs
                                .filter(x => !removedViewsIds.includes(x.id))
                                .concat(newlyAddedViews.filter(byBottomRegion).map(mapViewToTab));
                        }

                        $scope.centerSplittedTabViews = restoreCenterSplittedTabViews(savedState.center, removedViewsIds);

                        if (newlyAddedViews) {
                            $scope.centerSplittedTabViews.panes[0].tabs.push(...newlyAddedViews.filter(byCenterRegion).map(mapViewToTab));
                        }

                        if ($scope.bottomTabs.some(x => x.id === savedState.bottom.selected))
                            $scope.selection.selectedBottomTab = savedState.bottom.selected;

                        if (initialOpenViewsChanged)
                            saveLayoutState();

                    } else {
                        let openViews = $scope.initialOpenViews.map(viewById);

                        $scope.explorerTabs = openViews
                            .filter(byLeftRegion)
                            .map(mapViewToTab);

                        $scope.bottomTabs = openViews
                            .filter(byBottomRegion)
                            .map(mapViewToTab);

                        $scope.centerSplittedTabViews.panes[0].tabs = openViews
                            .filter(byCenterRegion)
                            .map(mapViewToTab);
                    }

                    $scope.$watch('selection', function (newSelection, oldSelection) {
                        if (!angular.equals(newSelection, oldSelection)) {
                            saveLayoutState();
                        }
                    }, true);

                    if (eventHandlers) {
                        Object.keys(eventHandlers).forEach(function (evtName) {
                            let handler = eventHandlers[evtName];
                            if (typeof handler === 'function')
                                messageHub.onDidReceiveMessage(evtName, handler);
                        });
                    }
                });

                $scope.closeCenterTab = function (tab) {
                    tryCloseCenterTabs([tab]);
                }

                $scope.moveCenterTab = function (tab) {
                    moveTab(tab.id);
                }

                $scope.collapseBottomPane = function () {
                    updateSplitPanesState({
                        editorsPaneState: SplitPaneState.EXPANDED,
                        bottomPanesState: SplitPaneState.COLLAPSED
                    });
                }

                $scope.expandBottomPane = function () {
                    updateSplitPanesState({
                        editorsPaneState: SplitPaneState.EXPANDED,
                        bottomPanesState: SplitPaneState.EXPANDED
                    });
                }

                $scope.toggleEditorsPane = function () {
                    let editorsPaneCollapsed = $scope.isEditorsPaneCollapsed();

                    updateSplitPanesState({
                        editorsPaneState: editorsPaneCollapsed ? SplitPaneState.EXPANDED : SplitPaneState.COLLAPSED,
                        bottomPanesState: SplitPaneState.EXPANDED
                    });
                }

                $scope.isEditorsPaneCollapsed = function () {
                    return $scope.splitPanesState.main[0] == SplitPaneState.COLLAPSED;
                }

                $scope.isBottomPaneCollapsed = function () {
                    return $scope.splitPanesState.main.length < 2 || $scope.splitPanesState.main[1] == SplitPaneState.COLLAPSED;
                }

                function loadLayoutState() {
                    let savedState = localStorage.getItem('DIRIGIBLE.IDE.LAYOUT.state.' + $scope.id);
                    if (savedState !== null) {
                        return JSON.parse(savedState);
                    }

                    return null;
                }

                function saveLayoutState() {

                    const saveCenterSplittedTabViews = function (parent) {
                        let ret;
                        if (parent.panes) {
                            ret = {
                                direction: parent.direction,
                                panes: []
                            };
                            for (let i = 0; i < parent.panes.length; i++) {
                                const pane = parent.panes[i];
                                ret.panes.push(saveCenterSplittedTabViews(pane));
                            }
                        } else {
                            ret = {
                                tabs: parent.tabs.map(x => ({ id: x.id, type: x.type, label: x.label, path: x.path, params: x.params })),
                                selectedTab: parent.selectedTab
                            };
                        }
                        return ret;
                    }

                    let state = {
                        initialOpenViews: $scope.initialOpenViews,
                        explorer: {
                            tabs: $scope.explorerTabs.map(x => ({ id: x.id, type: x.type, label: x.label, path: x.path }))
                        },
                        bottom: {
                            tabs: $scope.bottomTabs.map(x => ({ id: x.id, type: x.type, label: x.label, path: x.path })),
                            selected: $scope.selection.selectedBottomTab
                        },
                        center: saveCenterSplittedTabViews($scope.centerSplittedTabViews)
                    };

                    localStorage.setItem('DIRIGIBLE.IDE.LAYOUT.state.' + $scope.id, JSON.stringify(state));
                }

                function updateSplitPanesState(args) {
                    if ($scope.splitPanesState.main.length > 1) {
                        $scope.splitPanesState.main[0] = args.editorsPaneState;
                        $scope.splitPanesState.main[1] = args.bottomPanesState;
                    }
                }

                function findView(views, view) {
                    return views.find(v => v.id === view.id);
                }

                function mapViewToTab(view) {
                    return {
                        id: view.id,
                        type: VIEW,
                        label: view.label,
                        path: view.settings.path,
                    };
                }

                function findCenterSplittedTabView(id, pane = null, parent = null) {

                    let currentPane = pane || $scope.centerSplittedTabViews;

                    if (currentPane.tabs) {
                        const index = currentPane.tabs.findIndex(f => f.id === id);
                        if (index >= 0)
                            return { tabsView: currentPane, parent, index };

                    } else if (currentPane.panes) {
                        for (let childPane of currentPane.panes) {
                            let result = findCenterSplittedTabView(id, childPane, currentPane);
                            if (result)
                                return result;
                        }
                    }

                    return null;
                }

                function getCurrentCenterSplittedTabViewPane() {
                    return $scope.centerSplittedTabViews.panes[0];
                }

                function forEachCenterSplittedTabView(callback, parent) {
                    let parentNode = parent || $scope.centerSplittedTabViews;

                    if (parentNode.tabs) {
                        callback(parentNode);
                    } else if (parentNode.panes) {
                        for (let pane of parentNode.panes) {
                            forEachCenterSplittedTabView(callback, pane);
                        }
                    }
                }

                function moveTab(tabId) {
                    const result = findCenterSplittedTabView(tabId);
                    if (result) {
                        const splitView = result.parent;
                        const srcTabsView = result.tabsView;

                        if (srcTabsView.tabs.length === 1 && splitView.panes.length === 1)
                            return;

                        const tab = srcTabsView.tabs[result.index];

                        srcTabsView.tabs.splice(result.index, 1);

                        let destTabsView;
                        if (splitView.panes.length === 1) {
                            destTabsView = {
                                tabs: [tab],
                                selectedTab: tabId
                            }
                            splitView.panes.push(destTabsView);
                        } else {
                            const srcIndex = splitView.panes.indexOf(srcTabsView);
                            destTabsView = splitView.panes[srcIndex === 0 ? 1 : 0];
                            destTabsView.selectedTab = tabId;
                            destTabsView.tabs.push(tab);

                            if (srcTabsView.tabs.length === 0) {
                                splitView.panes.splice(srcIndex, 1);
                            }
                        }

                        $timeout(saveLayoutState, 1000);
                    }
                }

                function tryCloseCenterTabs(tabs) {
                    let dirtyFiles = tabs.filter(tab => tab.dirty);
                    if (dirtyFiles.length > 0) {

                        let tab = dirtyFiles[0];
                        let result = findCenterSplittedTabView(tab.id);
                        if (result) {
                            result.tabsView.selectedTab = tab.id;
                        }

                        messageHub.showDialog(
                            'You have unsaved changes',
                            'Do you want to save the changes you made to ' + tab.label + '?',
                            [{
                                id: { id: 'save', file: tab.id, tabs: tabs },
                                type: 'normal',
                                label: 'Save',
                            }, {
                                id: { id: 'ignore', file: tab.id, tabs: tabs },
                                type: 'normal',
                                label: 'Don\'t Save',
                            }, {
                                id: { id: 'cancel' },
                                type: 'transparent',
                                label: 'Cancel',
                            }],
                            'layout.dialog.close'
                        );
                    } else {
                        for (let i = 0; i < tabs.length; i++) {
                            removeCenterTab(tabs[i].id);
                        }

                        return true;
                    }

                    return false;
                }

                function removeCenterTab(id) {
                    let result = findCenterSplittedTabView(id);
                    if (result) {
                        const { tabsView, parent: splitView } = result;
                        tabsView.tabs.splice(result.index, 1);
                        if (tabsView.tabs.length === 0 && splitView.panes.length > 1) {
                            const index = splitView.panes.indexOf(tabsView);
                            splitView.panes.splice(index, 1);
                        }
                        saveLayoutState();
                        return true;
                    }

                    return false;
                }

                function closeCenterTab(id) {
                    if (removeCenterTab(id)) {
                        $scope.$digest();
                    }
                }

                let closingFileArgs;

                messageHub.onDidReceiveMessage('layout.dialog.close', function (msg) {
                    let args = msg.data;
                    switch (args.id) {
                        case 'save':
                            closingFileArgs = args;
                            messageHub.postMessage('workbench.editor.save', { file: args.file }, true);
                            break;
                        case 'ignore':
                            closeCenterTab(args.file)
                            messageHub.postMessage('editor.file.dirty', { file: args.file, isDirty: false }, true);

                            let rest = args.tabs.filter(x => x.id !== args.file);
                            if (rest.length > 0)
                                if (tryCloseCenterTabs(rest)) {
                                    $scope.$digest();
                                }

                            break;
                    }
                });

                messageHub.onDidReceiveMessage('editor.file.saved', function (msg) {
                    if (!closingFileArgs) return;

                    let fileName = msg.data;
                    if (fileName === closingFileArgs.file) {
                        closeCenterTab(fileName);

                        let rest = closingFileArgs.tabs.filter(x => x.id !== closingFileArgs.file);
                        if (rest.length > 0)
                            if (tryCloseCenterTabs(rest)) {
                                $scope.$digest();
                            }

                        closingFileArgs = null;
                    }
                });

                Layouts.manager = {
                    openEditor: function (resourcePath, resourceLabel, contentType, editorId = "editor", extraArgs = null) {
                        if (resourcePath) {
                            let editorPath = Editors.editorProviders[editorId];
                            if (!editorPath) {
                                let editors = Editors.editorsForContentType[contentType];
                                if (editors && editors.length > 0) {
                                    if (editors.length == 1) {
                                        editorId = editors[0].id;
                                    } else {
                                        let formEditors = editors.filter(function (e) {
                                            switch (e.id) {
                                                case "orion":
                                                case "monaco":
                                                case "ace":
                                                    return false;
                                                default:
                                                    return true;
                                            }
                                        });
                                        editorId = formEditors.length > 0 ? formEditors[0].id : editors[0].id;
                                    }
                                } else {
                                    editorId = Editors.defaultEditorId;
                                }

                                editorPath = Editors.editorProviders[editorId];
                            }

                            let params = Object.assign({
                                file: resourcePath,
                                contentType: contentType
                            }, extraArgs || {});

                            if (editorId === 'flowable')
                                editorPath += resourcePath;

                            let result = findCenterSplittedTabView(resourcePath);
                            let currentTabsView = result ? result.tabsView : getCurrentCenterSplittedTabViewPane();
                            if (result) {
                                currentTabsView.selectedTab = resourcePath;
                            } else {
                                let fileTab = {
                                    id: resourcePath,
                                    type: EDITOR,
                                    label: resourceLabel,
                                    path: editorPath,
                                    params: params
                                };

                                currentTabsView.selectedTab = resourcePath;
                                currentTabsView.tabs.push(fileTab);
                            }
                            $scope.$digest();

                            saveLayoutState();
                        }
                    },
                    closeEditor: function (resourcePath) {
                        let result = findCenterSplittedTabView(resourcePath);
                        if (result) {
                            let tab = result.tabsView.tabs[result.index];
                            if (tryCloseCenterTabs([tab])) {
                                $scope.$digest();
                            }
                        }
                    },
                    closeOtherEditors: function (resourcePath) {
                        let result = findCenterSplittedTabView(resourcePath);
                        if (result) {
                            let rest = result.tabsView.tabs.filter(x => x.id !== resourcePath);
                            if (rest.length > 0) {
                                if (tryCloseCenterTabs(rest)) {
                                    $scope.$digest();
                                }
                            }
                        }
                    },
                    closeAllEditors: function () {
                        forEachCenterSplittedTabView(pane => {
                            if (tryCloseCenterTabs(pane.tabs.slice())) {
                                $scope.$digest();
                            }
                        }, $scope.centerSplittedTabViews);
                    },
                    setEditorDirty: function (resourcePath, dirty) {
                        let result = findCenterSplittedTabView(resourcePath);
                        if (result) {
                            let fileTab = result.tabsView.tabs[result.index];
                            fileTab.dirty = dirty;
                            $scope.$digest();
                        }
                    },
                    openView: function (viewId) {
                        let view = $scope.views.find(v => v.id === viewId);
                        if (view) {
                            if (view.region.startsWith('left')) {
                                let explorerViewTab = findView($scope.explorerTabs, view);
                                if (explorerViewTab) {
                                    explorerViewTab.expanded = true;
                                } else {
                                    explorerViewTab = mapViewToTab(view);
                                    explorerViewTab.expanded = true;
                                    $scope.explorerTabs.push(explorerViewTab);
                                }

                            } else if (view.region === 'center-middle' || view.region === 'center-top') {
                                let result = findCenterSplittedTabView(view.id);
                                let currentTabsView = result ? result.tabsView : getCurrentCenterSplittedTabViewPane();
                                if (result) {
                                    currentTabsView.selectedTab = view.id;
                                } else {
                                    let centerViewTab = mapViewToTab(view);
                                    currentTabsView.selectedTab = view.id;
                                    currentTabsView.tabs.push(centerViewTab);
                                }

                            } else {
                                let bottomViewTab = findView($scope.bottomTabs, view);
                                if (bottomViewTab) {
                                    $scope.selection.selectedBottomTab = bottomViewTab.id;
                                } else {
                                    bottomViewTab = mapViewToTab(view);
                                    $scope.selection.selectedBottomTab = bottomViewTab.id;
                                    $scope.bottomTabs.push(bottomViewTab);
                                }

                                if ($scope.isBottomPaneCollapsed())
                                    $scope.expandBottomPane();
                            }

                            saveLayoutState();
                        }
                    }
                };
                Layouts.manager.open = Layouts.manager.openView;
            }],
            templateUrl: 'ide-layout/layout.html'
        };
    }])
    .directive('split', ['SplitPaneState', function (SplitPaneState) {
        return {
            restrict: 'E',
            replace: true,
            transclude: true,
            scope: {
                direction: '@',
                width: '@',
                height: '@',
                state: '=?'
            },
            controller: ['$scope', function ($scope) {
                $scope.panes = [];
                $scope.state = $scope.state || [];

                this.addPane = function (pane) {
                    $scope.panes.push(pane);
                    $scope.state.push(SplitPaneState.EXPANDED);

                    $scope.panes.sort((a, b) => {
                        let elementA = a.element[0];
                        let elementB = b.element[0];
                        if (elementA.previousElementSibling === null || elementB.nextElementSibling === null) return -1;
                        if (elementA.nextElementSibling === null || elementB.previousElementSibling === null) return 1;
                        if (elementA.nextElementSibling === elementB || elementB.previousElementSibling === elementA) return -1;
                        if (elementB.nextElementSibling === elementA || elementA.previousElementSibling === elementB) return 1;
                        return 0;
                    });
                };

                this.removePane = function (pane) {
                    let index = $scope.panes.indexOf(pane);
                    if (index !== -1) {
                        $scope.panes.splice(index, 1);
                    }
                };

                function normalizeSizes(sizes, index = -1) {
                    let isOpen = (size, i) => {
                        return Math.floor(size) > 0 && (index === -1 || index !== i);
                    };

                    let totalSize = sizes.reduce((x, y) => x + y, 0);
                    if (totalSize !== 100) {
                        let openCount = sizes.reduce((count, size, i) => isOpen(size, i) ? count + 1 : count, 0);
                        if (openCount > 0) {
                            let d = (100 - totalSize) / openCount;
                            for (let i = 0; i < sizes.length; i++) {
                                if (isOpen(sizes[i], i))
                                    sizes[i] += d;
                            }
                        }
                    }
                }

                $scope.isHorizontal = function () {
                    return $scope.direction === 'horizontal';
                }

                $scope.$watchCollection('panes', function () {
                    if ($scope.split) {
                        $scope.split.destroy();
                        $scope.split = null;
                    }

                    if ($scope.panes.length === 0 || $scope.panes.some(a => a.element === undefined)) {
                        return;
                    }

                    if ($scope.panes.length === 1) {
                        $scope.panes[0].element.css('width', '100%');
                        $scope.panes[0].element.css('height', '100%');
                        return;
                    }

                    let sizes = $scope.panes.map(pane => pane.size || 0);

                    normalizeSizes(sizes);

                    let minSizes = $scope.panes.map(pane => pane.minSize);
                    let elements = $scope.panes.map(pane => pane.element[0]);
                    let snapOffsets = $scope.panes.map(pane => pane.snapOffset);

                    $scope.split = Split(elements, {
                        direction: $scope.direction,
                        sizes: sizes,
                        minSize: minSizes,
                        expandToMin: true,
                        gutterSize: 4,
                        gutterAlign: 'start',
                        snapOffset: snapOffsets,
                        onDragEnd: function (newSizes) {
                            for (let i = 0; i < newSizes.length; i++) {
                                $scope.state[i] = Math.floor(newSizes[i]) === 0 ? SplitPaneState.COLLAPSED : SplitPaneState.EXPANDED;
                            }
                            $scope.$apply();
                        },
                    });
                });

                $scope.$watchCollection('state', function (newState, oldState) {
                    if (newState.length === oldState.length) {
                        //Process the collapsing first
                        for (let i = 0; i < newState.length; i++) {
                            if (newState[i] !== oldState[i]) {
                                if (newState[i] === SplitPaneState.COLLAPSED) {
                                    let sizes = $scope.split.getSizes();
                                    let size = Math.floor(sizes[i]);
                                    if (size > 0) {
                                        $scope.panes[i].lastSize = size;
                                        $scope.split.collapse(i);
                                    }
                                }
                            }
                        }
                        // ... and then the expanding/restore if necessary
                        for (let i = 0; i < newState.length; i++) {
                            if (newState[i] !== oldState[i]) {
                                if (newState[i] === SplitPaneState.EXPANDED) {
                                    let sizes = $scope.split.getSizes();
                                    let size = Math.floor(sizes[i]);
                                    if (size === 0) {
                                        let pane = $scope.panes[i];
                                        sizes[i] = pane.lastSize || pane.size;
                                        normalizeSizes(sizes, i);
                                        $scope.split.setSizes(sizes);
                                    }
                                }
                            }
                        }
                    }
                });
            }],
            template: '<div ng-class="{split: true, horizontal: isHorizontal(), vertical: !isHorizontal()}" ng-transclude></div>'
        };
    }])
    .directive('splitPane', function () {
        return {
            restrict: 'E',
            require: '^split',
            replace: true,
            transclude: true,
            scope: {
                size: '@',
                minSize: '@',
                snapOffset: '@'
            },
            link: function (scope, element, attrs, bgSplitCtrl) {
                let paneData = scope.paneData = {
                    element: element,
                    size: Number(scope.size),
                    minSize: Number(scope.minSize),
                    snapOffset: Number(scope.snapOffset)
                };

                bgSplitCtrl.addPane(paneData);

                scope.$on('$destroy', function () {
                    bgSplitCtrl.removePane(paneData);
                });
            }
        }
    })
    .directive('explorerToolbar', function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: 'ide-layout/toolbar.html',
            link: function (scope, element, attrs) {
                scope.hidden = true;

                scope.toggle = function () {
                    scope.hidden = !scope.hidden;
                };

                scope.hide = function () {
                    scope.hidden = true;
                }
            }
        };
    })
    .directive('accordion', ['$window', function ($window) {
        return {
            restrict: 'E',
            replace: true,
            transclude: true,
            scope: {},
            controller: function ($scope, $element) {
                let views = $scope.views = [];

                let availableHeight;

                function updateContentHeights(collapsingView = null) {
                    let expandedViews = $scope.views.filter(view => view.expanded);
                    let expandedViewsCount = expandedViews.length;
                    if (collapsingView) expandedViewsCount--;

                    let panelHeight = expandedViewsCount > 0 ? availableHeight / expandedViewsCount : 0;

                    for (let i = 0; i < $scope.views.length; i++) {
                        let view = $scope.views[i];
                        view.style = {
                            height: view.expanded && view !== collapsingView ? panelHeight + 'px' : '0'
                        };
                    }
                }

                function updateSize() {
                    let totalHeight = $element[0].clientHeight;
                    let headersHeight = getHeadersHeight();

                    availableHeight = totalHeight - headersHeight;

                    updateContentHeights();
                }

                function getHeadersHeight() {
                    let headers = $element[0].querySelectorAll('.fd-panel__header');

                    let h = 0;
                    for (let i = 0; i < headers.length; i++) {
                        h += headers[i].offsetHeight;
                    }
                    return h;
                }

                this.addView = function (view) {
                    if (views.length === 0)
                        view.expanded = true;

                    views.push(view);

                    updateContentHeights();
                }

                this.removeView = function (view) {
                    let index = views.indexOf(view);
                    if (index >= 0)
                        views.splice(index, 1);

                    updateContentHeights();
                }

                this.updateHeights = function (view) {
                    updateContentHeights(view);
                }

                this.updateSizes = function () {
                    updateSize();
                }

                angular.element($window).on('resize', function () {
                    updateSize();
                    $scope.$digest();
                });

                $scope.$on('$destroy', function () {
                    angular.element($window).off('resize');
                });
            },
            templateUrl: 'ide-layout/accordion.html'
        };
    }])
    .directive('accordionPane', ['$timeout', function ($timeout) {
        return {
            restrict: 'E',
            replace: true,
            require: '^accordion',
            scope: {
                view: '<'
            },
            link: function (scope, element, attrs, accordionCtrl) {
                accordionCtrl.addView(scope.view);

                scope.toggleView = function (view) {
                    if (!view.expanded) {
                        view.expanded = true;
                        $timeout(accordionCtrl.updateHeights);
                    } else {
                        accordionCtrl.updateHeights(view);
                        $timeout(function () {
                            view.expanded = false;
                        }, 200);
                    }
                }

                scope.$watch(scope.view, function () {
                    accordionCtrl.updateSizes();
                });

                scope.$on('$destroy', function () {
                    accordionCtrl.removeView(scope.view);
                });
            },
            templateUrl: 'ide-layout/accordionPane.html'
        };
    }])
    .directive('tabs', function () {
        return {
            restrict: 'E',
            transclude: {
                'buttons': '?buttons',
                'panes': 'panes'
            },
            replace: true,
            scope: {
                selectedPane: '=',
                closable: '@',
                removeTab: '&',
                moveTab: '&'
            },
            controller: function ($scope, $element) {
                let panes = $scope.panes = [];

                $scope.isPaneSelected = function (pane) {
                    return pane.id === $scope.selectedPane;
                }

                $scope.select = function (pane) {
                    if (this.isPaneSelected(pane))
                        return;

                    $scope.selectedPane = pane.id;
                }

                $scope.tabClick = function (pane, $event) {
                    if ($event.target.classList.contains('fd-button')) {
                        $scope.removeTab({ pane: pane });
                        return;
                    }

                    this.select(pane);
                };

                $scope.tabDblclick = function (pane) {
                    if ($scope.moveTab)
                        $scope.moveTab({ pane: pane });
                };

                this.addPane = function (pane) {
                    if (!$scope.selectedPane && panes.length == 0) {
                        $scope.select(pane);
                    }
                    panes.push(pane);
                }

                this.removePane = function (pane) {
                    let index = panes.indexOf(pane);
                    if (index >= 0)
                        panes.splice(index, 1);

                    let nextSelectedPane;
                    if ($scope.isPaneSelected(pane)) {
                        if ($scope.lastSelectedPane)
                            nextSelectedPane = panes.find(p => p.id === $scope.lastSelectedPane);

                        if (!nextSelectedPane && panes.length > 0) {
                            if (index < 0)
                                index = 0
                            else if (index >= panes.length)
                                index = panes.length - 1;

                            nextSelectedPane = panes[index];
                        }
                    }

                    if (nextSelectedPane) {
                        $scope.select(nextSelectedPane);
                        $scope.lastSelectedPane = null;
                    }
                }

                this.getSelectedPane = function () {
                    return $scope.selectedPane;
                }

                $scope.$watch('selectedPane', function (newValue, oldValue) {
                    $scope.lastSelectedPane = oldValue;
                });
            },
            templateUrl: 'ide-layout/tabs.html'
        };
    })
    .directive('tabPane', function () {
        return {
            restrict: 'E',
            transclude: true,
            replace: true,
            require: '^tabs',
            scope: {
                tab: '='
            },
            link: function (scope, element, attrs, tabsCtrl) {
                tabsCtrl.addPane(scope.tab);

                scope.isPaneSelected = function () {
                    return scope.tab.id === tabsCtrl.getSelectedPane();
                }

                scope.getParams = function () {
                    return scope.tab.params ? JSON.stringify(scope.tab.params) : '';
                }

                scope.$on('$destroy', function () {
                    tabsCtrl.removePane(scope.tab);
                });
            },
            templateUrl: 'ide-layout/tabPane.html'
        };
    })
    .directive('splittedTabs', function () {
        return {
            restrict: 'E',
            transclude: true,
            replace: true,
            scope: {
                direction: '=',
                panes: '=',
                removeTab: '&',
                moveTab: '&'
            },
            link: function (scope, element, attrs, tabsCtrl) {
                scope.onRemoveTab = function (pane) {
                    scope.removeTab({ pane: pane });
                };

                scope.onMoveTab = function (pane) {
                    scope.moveTab({ pane: pane });
                };
            },
            templateUrl: 'ide-layout/splittedTabs.html'
        };
    });