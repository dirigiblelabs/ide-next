
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
                $scope.explorerViews = [];
                $scope.bottomTabsViews = [];
                $scope.selectedFile = null;
                $scope.selectedView = null;

                if ($scope.layoutViews) {
                    $scope.initialOpenViews = $scope.layoutViews.split(',');
                } else {
                    $scope.initialOpenViews = $scope.viewsLayoutModel.views;
                }
                let eventHandlers = $scope.viewsLayoutModel.events;
                //let viewSettings = $scope.viewsLayoutModel.viewSettings;
                //let layoutSettings = $scope.viewsLayoutModel.layoutSettings;                

                Views.get().then(function (views) {
                    $scope.views = views;

                    var openViews = $scope.initialOpenViews
                        .map(function (viewId) {
                            return $scope.views.find(function (v) { return v.id === viewId });
                        });

                    $scope.explorerViews = openViews
                        .filter(function (view) {
                            return view.region.startsWith('left');
                        })
                        .map(function (view) {
                            return Object.assign({}, view);
                        });

                    $scope.bottomTabsViews = openViews
                        .filter(function (view) {
                            return view.region.startsWith('center');
                        })
                        .map(function (view) {
                            return Object.assign({}, view);
                        });

                    if (eventHandlers) {
                        Object.keys(eventHandlers).forEach(function (evtName) {
                            let handler = eventHandlers[evtName];
                            if (typeof handler === 'function')
                                messageHub.onDidReceiveMessage(evtName, handler);
                        });
                    }
                });

                let brandingInfo = getBrandingInfo();

                $scope.openFiles = [{ id: 'welcome', label: 'Welcome', path: brandingInfo.welcomePage }];

                $scope.closeFile = function (pane) {
                    var index = $scope.openFiles.findIndex(function (f) { return f.path === pane.path });
                    if (index >= 0)
                        $scope.openFiles.splice(index, 1);
                }

                function findView(views, view) {
                    return views.find(function (v) {
                        return v.id === view.id;
                    });
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
                                            switch (e) {
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
                                const extraArgs = Object.keys(extraArgs);
                                for (let i = 0; i < extraArgs.length; i++) {
                                    src += `&${extraArgs[i]}=${encodeURIComponent(extraArgs[extraArgs[i]])}`;
                                }
                            }

                            let file = $scope.openFiles.find(function (f) { return f.id === resourcePath });
                            if (file) {
                                $scope.selectedFile = file.path;
                            } else {
                                file = {
                                    id: resourcePath,
                                    label: resourceLabel,
                                    path: src
                                };

                                $scope.selectedFile = file.path;
                                $scope.openFiles.push(file);
                            }
                            $scope.$digest();
                        }
                    },
                    openView: function (viewId) {
                        var view = $scope.views.find(function (v) { return v.id === viewId });
                        if (view) {
                            if (view.region.startsWith('left')) {
                                var explorerView = findView($scope.explorerViews, view);
                                if (explorerView) {
                                    explorerView.expanded = true;//make sure this is the best way
                                } else {
                                    explorerView = Object.assign({}, view, { expanded: true });
                                    $scope.explorerViews.push(explorerView);
                                }
                            } else {
                                var bottomTabsView = findView($scope.bottomTabsViews, view);
                                if (bottomTabsView) {
                                    $scope.selectedView = bottomTabsView.id;
                                } else {
                                    bottomTabsView = Object.assign({}, view);
                                    $scope.selectedView = bottomTabsView.id;
                                    $scope.bottomTabsViews.push(bottomTabsView);
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
                };

                $scope.$watch($scope.panes, function () {
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

                    var sizes = $scope.panes.map(function (pane) {
                        return pane.size;
                    });

                    var minSizes = $scope.panes.map(function (pane) {
                        return pane.minSize;
                    });

                    var elements = $scope.panes.map(function (pane) {
                        return pane.element[0];
                    });

                    var snapOffsets = $scope.panes.map(function (pane) {
                        return pane.snapOffset;
                    });

                    Split(elements, {
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
                var paneData = {
                    element: element,
                    size: Number(scope.size),
                    minSize: Number(scope.minSize),
                    snapOffset: Number(scope.snapOffset),
                };

                bgSplitCtrl.addPane(paneData);
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
                    console.log('availableHeight: ' + availableHeight);

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
                            nextSelectedPane = $scope.lastSelectedPane;
                        else if (panes.length > 0) {
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
