"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentGroupBy = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GraphQLScalars = tslib_1.__importStar(require("graphql-scalars"));
const client_1 = require("@prisma/client");
const DocumentCountAggregate_1 = require("../outputs/DocumentCountAggregate");
const DocumentMaxAggregate_1 = require("../outputs/DocumentMaxAggregate");
const DocumentMinAggregate_1 = require("../outputs/DocumentMinAggregate");
let DocumentGroupBy = class DocumentGroupBy {
};
exports.DocumentGroupBy = DocumentGroupBy;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], DocumentGroupBy.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], DocumentGroupBy.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => GraphQLScalars.JSONResolver, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Object)
], DocumentGroupBy.prototype, "metadata", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Date)
], DocumentGroupBy.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Date)
], DocumentGroupBy.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentCountAggregate_1.DocumentCountAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentCountAggregate_1.DocumentCountAggregate)
], DocumentGroupBy.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentMinAggregate_1.DocumentMinAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentMinAggregate_1.DocumentMinAggregate)
], DocumentGroupBy.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentMaxAggregate_1.DocumentMaxAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentMaxAggregate_1.DocumentMaxAggregate)
], DocumentGroupBy.prototype, "_max", void 0);
exports.DocumentGroupBy = DocumentGroupBy = tslib_1.__decorate([
    TypeGraphQL.ObjectType("DocumentGroupBy", {})
], DocumentGroupBy);
