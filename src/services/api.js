import {inject} from 'aurelia-framework';
import {HttpClient, json} from 'aurelia-fetch-client';
import {buildQueryString} from 'aurelia-path';

@inject(HttpClient)
export class Api {
  constructor(http) {
    this.http = http;
  }

  static formatFilters(filterObj) {
    const formattedFilter = {};
    Object.keys(filterObj).forEach(key => {
      if (filterObj[key] !== null && filterObj[key] !== undefined && filterObj[key] !== '') {
        formattedFilter[`where[${key}]`] = filterObj[key];
      }
    });
    return formattedFilter;
  }

  _getQuery(path, params) {
    if (!params) {
      return path;
    }

    let query = path + '?';

    if (params.filter && Object.keys(params.filter).length) {
      query = `${query}${buildQueryString(Api.formatFilters(params.filter, 'where'))}`;
    }

    if (params.include && params.include.length) {
      let includeQuery = {include: `[${params.include.join(',')}]`};
      query = `${query}&${buildQueryString(includeQuery)}`;
    }

    if (params.page) {
      query = `${query}&page[number]=${params.page.number}&page[size]=${params.page.size}`;
    }

    if (params.sort) {
      query = `${query}&sort=${params.sort}`;
    }

    if (params.folder_name || params.file_name) {
      query = `${query}&folder_name=${params.folder_name}&file_name=${params.file_name}`;
    }

    return query;
  }

  fetch(path, params) {
    return this.http
      .fetch(this._getQuery(path, params))
      .then(response => response.json());
  }

  create(path, body) {
    return this.http
      .fetch(path, {
        method: 'POST',
        body: json(body)
      });
  }

  edit(path, body) {
    return this.http
      .fetch(path, {
        method: 'PUT',
        body: json(body)
      });
  }

  remove(path) {
    return this.http
      .fetch(path, {
        method: 'DELETE'
      });
  }
}
