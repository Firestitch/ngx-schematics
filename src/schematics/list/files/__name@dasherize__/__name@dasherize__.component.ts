import { Component, OnInit, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';<% if (mode === 'full') { %>
import { Router, ActivatedRoute } from '@angular/router';<% } %>

import { FsListComponent, FsListConfig } from '@firestitch/list';
import { ItemType } from '@firestitch/filter';<% if (titledCreateComponent) { %>
import { FsNavService } from '@firestitch/nav';
<% } %>

import { map } from 'rxjs/operators';

import { <%= classify(serviceName) %> } from '<%= relativeServicePath %>';


@Component({
  templateUrl: './<%=dasherize(name)%>.component.html',
  styleUrls: ['./<%=dasherize(name)%>.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class <%= classify(name) %>Component implements OnInit {

  public listConfig: FsListConfig;

  @ViewChild(FsListComponent)
  private _listComponent: FsListComponent;

  constructor(
    private _cdRef: ChangeDetectorRef,
    private _<%= camelize(serviceName) %>: <%= classify(serviceName) %>,<% if (titledCreateComponent) { %>
    private _navService: FsNavService,<% } %><% if (mode === 'full') { %>
    private _route: ActivatedRoute,
    private _router: Router,<% } %>
  ) {}

  public ngOnInit(): void {<% if (titledCreateComponent) { %>
    this._setTitle();
<% } %>
    this.listConfig = {
      filters: [
        {
          name: 'keyword',
          type: ItemType.Keyword,
          label: 'Search',
        },
      ],
      actions: [
        {
          label: 'Create',
          click: (event) => {<% if (mode === 'full') { %>
            this._router.navigate(['create'], { relativeTo: this._route });<%} if (mode === 'dialog' || mode === 'dialog-create-page-edit') {%>
            this.openDialog({});<%}%>
          },
        },
      ],
      rowActions: [
        {
          click: (data) => {
            return this._<%= camelize(serviceName) %>.delete(data);
          },
          remove: {
            title: 'Confirm',
            template: 'Are you sure you would like to delete this record?',
          },
          menu: true,
          label: 'Delete',
        },
      ],
      fetch: (query) => {
        return this._<%= camelize(serviceName) %>.gets(query, { key: null })
          .pipe(
            map((response: any) => {
              return { data: response.<%= pluralModel %>, paging: response.paging };
            }),
          );
      },
      restore: {
        query: { state: 'deleted' },
        filterLabel: 'Show Deleted',
        menuLabel: 'Restore',
        reload: true,
        click: (row) => {
          return this._<%= camelize(serviceName) %>.put({ id: row.id, state: 'active' });
        },
      },
    };
  }<% if (titledCreateComponent) { %>

  private _setTitle(): void {
    this._navService.setTitle('<%= capitalize(name) %>');
  }<% } %>

}

