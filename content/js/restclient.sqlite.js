/* ***** BEGIN LICENSE BLOCK *****
Copyright (c) 2007-2012, Chao ZHOU (chao@zhou.fr). All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * Neither the name of the author nor the names of its contributors may
      be used to endorse or promote products derived from this software
      without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * ***** END LICENSE BLOCK ***** */

"use strict";

restclient.sqlite = {
  db: null,
  tables: {
    requests: " uuid TEXT NOT NULL PRIMARY KEY, \
                requestName TEXT NOT NULL, \
                requestUrl TEXT NOT NULL, \
                requestMethod TEXT NOT NULL, \
                request TEXT NOT NULL, \
                creationTime INTEGER NOT NULL, \
                lastAccess INTEGER NOT NULL",
    labels: " labelName TEXT NOT NULL, \
              uuid TEXT NOT NULL",
    history: "requestId TEXT PRIMARY KEY, \
              request TEXT NOT NULL, \
              lastAccess INTEGER NOT NULL"
  },
  sql: {
    queryHistory: 'SELECT request FROM history WHERE requestId = :requestId',
    updateHistory: 'UPDATE history SET lastAccess = :lastAccess WHERE requestId = :requestId',
    newHistory: 'INSERT INTO history (requestId, request, lastAccess) VALUES (:requestId, :request, :lastAccess)',
    removeHistory: 'DELETE FROM history WHERE lastAccess < :lastAccess',
    
    queryLabels: 'SELECT count(labelName),labelName FROM labels GROUP BY labelName',
    newLabels: 'INSERT INTO labels (labelName, uuid) VALUES (:labelName, :uuid)',
    removeLabels: 'DELETE FROM labels WHERE uuid = :uuid',
    
    queryRequests: 'SELECT * FROM requests WHERE uuid = :uuid',
    queryRequestsByLabel: 'SELECT * FROM requests WHERE uuid IN (SELECT uuid FROM labels WHERE labelName = :labelName)',
    newRequests: 'INSERT INTO requests (uuid, requestName, requestUrl, requestMethod, request, creationTime, LastAccess) VALUES (:uuid, :requestName, :requestUrl, :requestMethod, :request, :creationTime, :LastAccess)',
    removeRequests: 'DELETE FROM requests WHERE uuid = :uuid'
  },
  open: function() {
    try{
      var file = restclient.FileUtils.getFile("ProfD", ["restclient.sqlite"]);
      restclient.log(file.path);
      restclient.sqlite.db = restclient.Services.storage.openDatabase(file);
      restclient.sqlite.initStatements();
      return true;
    }
    catch(e) {
      restclient.error(e);
    }
    return false;
  },
  close: function() {
    try{
      restclient.db.asyncClose();
    }
    catch(e) {
      restclient.error(e);
    }
  },
  initTables: function() {
    try{
      restclient.sqlite.db.createTable('requests', restclient.sqlite.tables['requests']);
      restclient.sqlite.db.createTable('labels', restclient.sqlite.tables['labels']);
      restclient.sqlite.db.createTable('history', restclient.sqlite.tables['history']);
    }
    catch(e) {
      restclient.error(e);
    }
  },
  getStatement: function(sqlName) {
    return restclient.sqlite.db.createStatement(restclient.sqlite.sql[sqlName]);
  },
  getHistory: function(requestId){
    if(typeof requestId !== 'string' || requestId === '')
      return false;
    var stmt = restclient.sqlite.getStatement('queryHistory');
    var params = stmt.newBindingParamsArray(),
        binding = params.newBindingParams();

    binding.bindByName("requestId", requestId);
    params.addParams(binding);
    stmt.bindParameters(params);
    
    while (stmt.executeStep()) {
      return stmt.row.request;
    }
    return false;
  },
  saveHistory: function(request, success, handleError) {
    var requestStr = JSON.stringify(request);
    var requestId = "r-" + restclient.helper.sha1(requestStr);
    var lastAccess = new Date().valueOf();
    var exists = restclient.sqlite.getHistory(requestId);
    
    var sqlName = (exists === false) ? "newHistory" : "updateHistory";
    var stmt = restclient.sqlite.getStatement(sqlName);
    try{
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
      
      binding.bindByName("requestId", requestId);
      if (exists === false)
        binding.bindByName("request", requestStr);
      binding.bindByName("lastAccess", lastAccess);
      params.addParams(binding);
      stmt.bindParameters(params);
      stmt.executeAsync({
        handleError: function(aError) {
          restclient.error(aError);
          if(typeof handleError === 'function')
            handleError.apply(restclient.main, [request]);
        },
        handleCompletion: function(aReason) {
          if (aReason == Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED
              && typeof success === 'function')
            success.apply(restclient.main, [requestId]);
        }
      });
    }finally{
      stmt.reset();
    }
  },
  removeHistory: function(days, success, handleError) {
    var lastAccess = new Date();
    lastAccess.setDate(date.getDate() - days);
    lastAccess = lastAccess.valueOf();
    var stmt = restclient.sqlite.getStatement('removeHistory');
    try{
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
      
      binding.bindByName("lastAccess", lastAccess);

      params.addParams(binding);
      stmt.bindParameters(params);
      stmt.executeAsync({
        handleError: function(aError) {
          restclient.error(aError);
          if(typeof handleError === 'function')
            handleError.apply(restclient.main, [request]);
        },
        handleCompletion: function(aReason) {
          if (aReason == Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED
              && typeof success === 'function')
            success.apply(restclient.main, [requestId]);
        }
      });
    }finally{
      stmt.reset();
    }
  },
  saveRequest: function(request, name, labels, success, handleError) {
    return false;
    var id = "r-" + restclient.helper.sha1(JSON.stringify(request));
    var savedRequest = restclient.sqlite.getRequest(id);
    var last_executed = new Date().valueOf();
    name = name || '';
    favorite = favorite || 0;
    labels = labels || [];
    
    if(savedRequest === false) {
      var created_datetime = new Date().valueOf();
      var stmt = restclient.sqlite.db.createStatement("INSERT INTO requests (id, name, favorite, request_method, request_url, request_body, request, created_datetime, last_executed) VALUES "
                                                     + "(:id, :name, :favorite, :request_method, :request_url, :request_body, :request, :created_datetime, :last_executed)");
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();

      binding.bindByName("id", id);
      binding.bindByName("name", name);
      binding.bindByName("favorite", favorite);
      binding.bindByName("request_method", request.method);
      binding.bindByName("request_url", request.url);
      binding.bindByName("request_body", request.body);
      binding.bindByName("request", JSON.stringify(request));
      binding.bindByName("created_datetime", created_datetime);
      binding.bindByName("last_executed", last_executed);

      params.addParams(binding);
      stmt.bindParameters(params);
      stmt.executeAsync({
        handleError: function(aError) {
          console.error("Error: " + aError.message);
        },
        handleCompletion: function(aReason) {
          if (aReason == Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED
              && typeof callback === 'function')
            callback.apply(restclient.main, [id]);
        }
      });
    }
    else
    {
      var stmt = restclient.sqlite.db.createStatement("UPDATE requests SET last_executed=:last_executed, name=:name, favorite=:favorite WHERE id=:id");
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();

      binding.bindByName("id", id);
      binding.bindByName("name", name);
      binding.bindByName("favorite", favorite);
      binding.bindByName("last_executed", last_executed);

      params.addParams(binding);
      stmt.bindParameters(params);
      stmt.executeAsync({
        handleError: function(aError) {
          console.error("Error: " + aError.message);
        },
        handleCompletion: function(aReason) {
          if (aReason == Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED
              && typeof callback === 'function')
            callback.apply(restclient.main, [id]);
        }
      });
    }
  },
  
  getRequest: function(id){
    if(typeof id !== 'string' || id === '')
      return false;
    var stmt = restclient.sqlite.db.createStatement("SELECT request FROM requests WHERE id=:id");
    var params = stmt.newBindingParamsArray(),
        binding = params.newBindingParams();

    binding.bindByName("id", id);
    params.addParams(binding);
    stmt.bindParameters(params);
    while (stmt.executeStep()) {
      return stmt.row.request;
    }
    return false;
  },
  getLabels: function(){
    var stmt = restclient.sqlite.db.createStatement("SELECT sum(label) as num FROM requests");
    while (stmt.executeStep()) {
      return stmt.row.num;
    }
    return false;
  },
  importRequestFromJSON: function(setting) {
    // version <= 2.0.3
    if( typeof setting.labels === 'undefined' ) {
      for(var name in setting) {
        var request = setting[name],
            id = restclient.helper.sha1( JSON.stringify(request) );
        restclient.sqlite.saveRequest(request, name, 1);
      }
    }
    
  },
  migrateFavoriteRequest: function() {
    var requests = restclient.getPref('savedRequest', '');
    dump('savedRequest:' + requests);
    if( requests === '')
      return false;

    restclient.sqlite.open();
    restclient.sqlite.initTables();
    restclient.sqlite.importRequestFromJSON(JSON.parse(requests));
    restclient.sqlite.close();
  }
}