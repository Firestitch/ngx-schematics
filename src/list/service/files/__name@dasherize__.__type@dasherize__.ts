import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FsApi } from '@firestitch/api';

@Injectable()
export class <%= classify(name) %><% if (type === 'service'){ %>Service<%} else {%>Data<%}%> {
  constructor(private _fsApi: FsApi) {
  }

  public get(<%= name %>_id, query = {}): Observable<any> {
      return this._fsApi.get(`<%= pluralName %>/${<%= name %>_id}`, query, { key: '<%= name %>' });
  }

  public gets(data = {}, config = {}): Observable<any> {
      return this._fsApi.request('GET', '<%= pluralName %>', data, Object.assign({ key: '<%= pluralName %>' }, config));
  }

  public put(<%= name %>, config = {}): Observable<any> {
      return this._fsApi.put(`<%= pluralName %>/${<%= name %>.id}`, <%= name %>, Object.assign({ key: '<%= name %>' }, config));
  }

  public post(<%= name %>): Observable<any> {
      return this._fsApi.post('<%= pluralName %>', <%= name %>, { key: '<%= name %>' });
  }

  public delete(<%= name %>): Observable<any> {
      return this._fsApi.delete(`<%= pluralName %>/${<%= name %>.id}`, <%= name %>, { key: '<%= name %>' });
  }

  public save(data): Observable<any> {
      if (data.id) {
      return this.put(data);
    }
    return this.post(data);
  }

}