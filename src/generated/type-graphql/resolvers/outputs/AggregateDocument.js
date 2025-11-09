"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregateDocument = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DocumentCountAggregate_1 = require("../outputs/DocumentCountAggregate");
const DocumentMaxAggregate_1 = require("../outputs/DocumentMaxAggregate");
const DocumentMinAggregate_1 = require("../outputs/DocumentMinAggregate");
let AggregateDocument = class AggregateDocument {
};
exports.AggregateDocument = AggregateDocument;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentCountAggregate_1.DocumentCountAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentCountAggregate_1.DocumentCountAggregate)
], AggregateDocument.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentMinAggregate_1.DocumentMinAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentMinAggregate_1.DocumentMinAggregate)
], AggregateDocument.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentMaxAggregate_1.DocumentMaxAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentMaxAggregate_1.DocumentMaxAggregate)
], AggregateDocument.prototype, "_max", void 0);
exports.AggregateDocument = AggregateDocument = tslib_1.__decorate([
    TypeGraphQL.ObjectType("AggregateDocument", {})
], AggregateDocument);
