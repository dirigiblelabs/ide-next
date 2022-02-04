
angular.module('layout', ['idePerspective', 'ideMessageHub'])
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
    .directive('ideLayout', ['Views', 'Layouts', 'Editors', 'messageHub', function (Views, Layouts, Editors, messageHub) {
        return {
            restrict: 'E',
            replace: true,
            scope: {
                viewsLayoutModel: '=',
                layoutViews: '@',
            },
            controller: ['$scope', function ($scope) {
                $scope.views = [];
                $scope.explorerTabs = [];
                $scope.bottomTabs = [];
                $scope.centerTabs = [];
                $scope.selectedCenterTab = null;
                $scope.selectedBottomTab = null;
                $scope.layoutSettings = $scope.viewsLayoutModel.layoutSettings || {};

                if ($scope.layoutViews) {
                    $scope.initialOpenViews = $scope.layoutViews.split(',');
                } else {
                    $scope.initialOpenViews = $scope.viewsLayoutModel.views;
                }
                let eventHandlers = $scope.viewsLayoutModel.events;
                //let viewSettings = $scope.viewsLayoutModel.viewSettings;                

                Views.get().then(function (views) {
                    $scope.views = views;

                    var openViews = $scope.initialOpenViews
                        .map(function (viewId) {
                            return $scope.views.find(function (v) { return v.id === viewId });
                        });

                    $scope.explorerTabs = openViews
                        .filter(function (view) {
                            return view.region.startsWith('left');
                        })
                        .map(mapViewToTab);

                    $scope.bottomTabs = openViews
                        .filter(function (view) {
                            return view.region === 'center-bottom';
                        })
                        .map(mapViewToTab);

                    $scope.centerTabs = openViews
                        .filter(function (view) {
                            return view.region === 'center-top' || view.region === 'center-middle';
                        })
                        .map(mapViewToTab);

                    if (eventHandlers) {
                        Object.keys(eventHandlers).forEach(function (evtName) {
                            let handler = eventHandlers[evtName];
                            if (typeof handler === 'function')
                                messageHub.onDidReceiveMessage(evtName, handler);
                        });
                    }
                });

                $scope.closeCenterTab = function (pane) {
                    var index = $scope.centerTabs.findIndex(function (f) { return f.path === pane.path });
                    if (index >= 0)
                        $scope.centerTabs.splice(index, 1);
                }

                function findView(views, view) {
                    return views.find(function (v) {
                        return v.id === view.id;
                    });
                }

                function mapViewToTab(view) {
                    return {
                        id: view.id,
                        label: view.label,
                        path: view.settings.path
                    };
                }

                Layouts.manager = {
                    openEditor: function (resourcePath, resourceLabel, contentType, editorId = "editor", extraArgs = null) {
                        if (resourcePath) {
                            let src;

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

                            if (editorId === 'flowable')
                                src = editorPath + resourcePath;
                            else
                                src = editorPath + '?file=' + resourcePath;

                            if (contentType && editorId !== 'flowable')
                                src += "&contentType=" + contentType;

                            if (extraArgs) {
                                const extraArgsKeys = Object.keys(extraArgs);
                                for (let i = 0; i < extraArgsKeys.length; i++) {
                                    src += `&${extraArgsKeys[i]}=${encodeURIComponent(extraArgs[extraArgsKeys[i]])}`;
                                }
                            }

                            let fileTab = $scope.centerTabs.find(function (f) { return f.id === resourcePath });
                            if (fileTab) {
                                $scope.selectedCenterTab = fileTab.id;
                            } else {
                                fileTab = {
                                    id: resourcePath,
                                    label: resourceLabel,
                                    path: src
                                };

                                $scope.selectedCenterTab = fileTab.id;
                                $scope.centerTabs.push(fileTab);
                            }
                            $scope.$digest();
                        }
                    },
                    openView: function (viewId) {
                        var view = $scope.views.find(function (v) { return v.id === viewId });
                        if (view) {
                            if (view.region.startsWith('left')) {
                                var explorerViewTab = findView($scope.explorerTabs, view);
                                if (explorerViewTab) {
                                    explorerViewTab.expanded = true;
                                } else {
                                    explorerViewTab = mapViewToTab(view);
                                    explorerViewTab.expanded = true;
                                    $scope.explorerTabs.push(explorerViewTab);
                                }

                            } else if (view.region === 'center-middle' || view.region === 'center-top') {
                                var centerViewTab = findView($scope.centerTabs, view);
                                if (centerViewTab) {
                                    $scope.selectedCenterTab = centerViewTab.id;
                                } else {
                                    centerViewTab = mapViewToTab(view);
                                    $scope.selectedCenterTab = centerViewTab.id;
                                    $scope.centerTabs.push(centerViewTab);
                                }

                            } else {
                                var bottomViewTab = findView($scope.bottomTabs, view);
                                if (bottomViewTab) {
                                    $scope.selectedBottomTab = bottomViewTab.id;
                                } else {
                                    bottomViewTab = mapViewToTab(view);
                                    $scope.selectedBottomTab = bottomViewTab.id;
                                    $scope.bottomTabs.push(bottomViewTab);
                                }
                            }
                        }
                    }
                };
            }],
            templateUrl: 'ide-layout/layout.html'
        };
    }])
    .directive('split', function () {
        return {
            restrict: 'E',
            replace: true,
            transclude: true,
            scope: {
                direction: '@',
                width: '@',
                height: '@'
            },
            controller: ['$scope', function ($scope) {
                $scope.panes = [];

                this.addPane = function (pane) {
                    $scope.panes.push(pane);

                    $scope.panes.sort(function (a, b) {
                        var elementA = a.element[0];
                        var elementB = b.element[0];
                        if (elementA.previousElementSibling === null || elementB.nextElementSibling === null) return -1;
                        if (elementA.nextElementSibling === null || elementB.previousElementSibling === null) return 1;
                        if (elementA.nextElementSibling === elementB || elementB.previousElementSibling === elementA) return -1;
                        if (elementB.nextElementSibling === elementA || elementA.previousElementSibling === elementB) return 1;
                        return 0;
                    });
                };

                this.removePane = function (pane) {
                    var index = $scope.panes.indexOf(pane);
                    if (index !== -1) {
                        $scope.panes.splice(index, 1);
                    }
                };

                function calcSizes() {
                    var currentSizes;

                    if ($scope.split)
                        currentSizes = $scope.split.getSizes();

                    var sizes = [];
                    var openPanes = 0;
                    var totalSize = 0;
                    for (var i = 0; i < $scope.panes.length; i++) {
                        var pane = $scope.panes[i];
                        var size = currentSizes ? currentSizes[i] : pane.size;

                        if (size > 0) openPanes++;
                        totalSize += size;

                        sizes.push(size);
                    }

                    if (openPanes > 0 && totalSize < 100) {
                        var distrSize = (100 - totalSize) / openPanes;
                        for (var i = 0; i < sizes.length; i++) {
                            if (sizes[i] > 0)
                                sizes[i] += distrSize;
                        }
                    }

                    return sizes;
                }

                $scope.$watchCollection('panes', function () {
                    if ($scope.panes.length === 0 || $scope.panes.some(function (a) {
                        return a.element === undefined;
                    })) {
                        return;
                    }

                    if ($scope.panes.length === 1) {
                        $scope.panes[0].element.css('width', '100%');
                        $scope.panes[0].element.css('height', '100%');
                        return;
                    }

                    var sizes = calcSizes();

                    var minSizes = $scope.panes.map(function (pane) {
                        return pane.minSize;
                    });

                    var elements = $scope.panes.map(function (pane) {
                        return pane.element[0];
                    });

                    var snapOffsets = $scope.panes.map(function (pane) {
                        return pane.snapOffset;
                    });

                    $scope.split = Split(elements, {
                        direction: $scope.direction,
                        sizes: sizes,
                        minSize: minSizes,
                        expandToMin: true,
                        gutterSize: 4,
                        gutterAlign: 'start',
                        snapOffset: snapOffsets
                    });
                });
            }]
        };
    })
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
                var paneData = scope.paneData = {
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
            templateUrl: 'ide-layout/toolbar.html'
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

                var availableHeight;

                function updateContentHeights(collapsingView) {
                    var expandedViews = $scope.views.filter(function (view) { return view.expanded; });
                    var expandedViewsCount = expandedViews.length;
                    if (collapsingView) expandedViewsCount--;

                    var panelHeight = expandedViewsCount > 0 ? availableHeight / expandedViewsCount : 0;

                    for (var i = 0; i < $scope.views.length; i++) {
                        var view = $scope.views[i];
                        view.style = {
                            height: view.expanded && view !== collapsingView ? panelHeight + 'px' : '0'
                        };
                    }
                }

                function updateSize() {
                    var totalHeight = $element[0].clientHeight;
                    var headersHeight = getHeadersHeight();

                    availableHeight = totalHeight - headersHeight;

                    updateContentHeights();
                }

                function getHeadersHeight() {
                    var headers = $element[0].querySelectorAll('.fd-panel__header');

                    var h = 0;
                    for (var i = 0; i < headers.length; i++) {
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
                    var index = views.indexOf(view);
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
            transclude: true,
            replace: true,
            scope: {
                selectedPane: '=',
                closable: '@',
                removeTab: '&'
            },
            controller: function ($scope, $element) {
                var panes = $scope.panes = [];

                $scope.isPaneSelected = function (pane) {
                    return pane.id === $scope.selectedPane;
                }

                $scope.select = function (pane) {
                    if (this.isPaneSelected(pane))
                        return;

                    $scope.lastSelectedPane = $scope.selectedPane;
                    $scope.selectedPane = pane.id;
                }

                $scope.tabClick = function (pane, $event) {
                    if ($event.target.classList.contains('fd-button')) {
                        $scope.removeTab({ pane: pane });
                        return;
                    }

                    this.select(pane);
                };

                this.addPane = function (pane) {
                    if (panes.length == 0) {
                        $scope.select(pane);
                    }
                    panes.push(pane);
                }

                this.removePane = function (pane) {
                    var index = panes.indexOf(pane);
                    if (index >= 0)
                        panes.splice(index, 1);

                    var nextSelectedPane;
                    if ($scope.isPaneSelected(pane)) {
                        if ($scope.lastSelectedPane)
                            nextSelectedPane = panes.find(function (p) { return p.id === $scope.lastSelectedPane });

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
            },
            link: function (scope, element) {
                Scrollbar.init(element.children()[0], {
                    damping: 0.5
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
                title: '<',
                path: '<',
                id: '<'
            },
            link: function (scope, element, attrs, tabsCtrl) {
                tabsCtrl.addPane(scope);

                scope.isPaneSelected = function () {
                    return scope.id === tabsCtrl.getSelectedPane();
                }

                scope.$on('$destroy', function () {
                    tabsCtrl.removePane(scope);
                });
            },
            templateUrl: 'ide-layout/tabPane.html'
        };
    });